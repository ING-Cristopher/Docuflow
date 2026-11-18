using System.Text.Json;
using DocuFlow.Application.Abstractions;
using DocuFlow.Domain.Auditing;
using DocuFlow.Domain.Common;
using DocuFlow.Domain.Documents;
using DocuFlow.Domain.Extraction;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DocuFlow.Application.Processing;

public sealed class DocumentProcessingService
{
    private readonly IApplicationDbContext _dbContext;
    private readonly IBlobStorageService _blobStorage;
    private readonly IDocumentIntelligenceService _intelligence;
    private readonly IDocumentQueueService _queueService;
    private readonly ILogger<DocumentProcessingService> _logger;
    private readonly IDocumentAiAnalyzer _aiAnalyzer;

    private const decimal AiTypeMismatchMinConfidence = 0.8m;

    public DocumentProcessingService(
        IApplicationDbContext dbContext,
        IBlobStorageService blobStorage,
        IDocumentIntelligenceService intelligence,
        IDocumentAiAnalyzer aiAnalyzer,
        IDocumentQueueService queueService,
        ILogger<DocumentProcessingService> logger)
    {
        _dbContext = dbContext;
        _blobStorage = blobStorage;
        _intelligence = intelligence;
        _aiAnalyzer = aiAnalyzer;
        _queueService = queueService;
        _logger = logger;
    }

    public async Task ProcessAsync(DocumentProcessingMessage message, CancellationToken cancellationToken = default)
    {
        var doc = await _dbContext.Documents
            .IgnoreQueryFilters()
            .Include(d => d.Versions)
            .FirstOrDefaultAsync(
                d => d.OrganizationId == message.OrganizationId && d.Id == message.DocumentId,
                cancellationToken);

        if (doc is null)
        {
            _logger.LogWarning("Skipping missing document {DocumentId} for org {OrganizationId}.", message.DocumentId, message.OrganizationId);
            return;
        }

        // Idempotency guard: skip if already processed, approved/rejected, or superseded by a newer version.
        if (doc.Status != DocumentStatus.Queued || doc.LatestVersionId != message.DocumentVersionId)
        {
            _logger.LogInformation("Skipping document {DocumentId} in status {Status} (version {VersionId}).",
                doc.Id, doc.Status, message.DocumentVersionId);
            return;
        }

        var version = doc.Versions.FirstOrDefault(v => v.Id == message.DocumentVersionId);
        if (version is null)
            return;

        doc.StartProcessing();
        var run = new ExtractionRun(doc.OrganizationId, doc.Id, version.Id, "DocumentIntelligence", "prebuilt-document");
        _dbContext.ExtractionRuns.Add(run);
        await _dbContext.SaveChangesAsync(cancellationToken);

        try
        {
            await using var stream = await _blobStorage.DownloadAsync(version.BlobPath, cancellationToken);
            var analysis = await _intelligence.AnalyzeAsync(stream, version.ContentType, cancellationToken);

            run.MarkSucceeded(new ConfidenceScore(analysis.OverallConfidence), analysis.RawResponseJson);

            var extractedEntities = analysis.Fields.Select(f => new ExtractedField(
                doc.OrganizationId,
                doc.Id,
                version.Id,
                f.FieldName,
                f.RawValue,
                f.NormalizedValue,
                new ConfidenceScore(f.Confidence),
                f.PageNumber,
                f.BoundingBoxJson,
                f.IsFinanciallySensitive)).ToList();

            _dbContext.ExtractedFields.AddRange(extractedEntities);

            var issues = ValidateExtractedFields(doc.OrganizationId, doc.Id, version.Id, analysis.DetectedType, extractedEntities);
            issues.AddRange(await RunAiAnalysisAsync(doc, version.Id, analysis, cancellationToken));
            if (issues.Count > 0)
                _dbContext.ValidationIssues.AddRange(issues);

            var requiresHumanReview = extractedEntities.Any(f => f.RequiresReview) || issues.Count > 0;
            doc.MarkExtracted(analysis.DetectedType, requiresHumanReview);

            _dbContext.AuditLogs.Add(new AuditLog(
                doc.OrganizationId,
                null,
                "DocumentProcessed",
                nameof(Document),
                doc.Id,
                $"{{\"status\":\"{doc.Status}\",\"fields\":{extractedEntities.Count},\"issues\":{issues.Count}}}"));

            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing document {DocumentId} (attempt {Attempt}).", doc.Id, message.Attempt);
            run.MarkFailed(ex.Message);
            doc.RecordFailure(ex.Message, canRetry: true);

            _dbContext.AuditLogs.Add(new AuditLog(
                doc.OrganizationId,
                null,
                "DocumentProcessingFailed",
                nameof(Document),
                doc.Id));

            await _dbContext.SaveChangesAsync(cancellationToken);

            if (doc.Status == DocumentStatus.Queued)
            {
                var retryMessage = message with { Attempt = message.Attempt + 1 };
                var retryOutbox = new OutboxMessage(doc.OrganizationId, "DocumentQueued", JsonSerializer.Serialize(retryMessage));
                _dbContext.OutboxMessages.Add(retryOutbox);
                await _dbContext.SaveChangesAsync(cancellationToken);

                try
                {
                    await _queueService.EnqueueAsync(retryMessage, cancellationToken);
                    retryOutbox.MarkProcessed();
                    await _dbContext.SaveChangesAsync(cancellationToken);
                }
                catch
                {
                    // Outbox relay in Worker will retry publishing this message.
                }
            }
        }
    }

    public async Task<int> DispatchPendingOutboxAsync(CancellationToken cancellationToken = default)
    {
        var pending = await _dbContext.OutboxMessages
            .IgnoreQueryFilters()
            .Where(m => m.ProcessedAt == null && m.RetryCount < 5)
            .OrderBy(m => m.OccurredAt)
            .Take(20)
            .ToListAsync(cancellationToken);

        var dispatched = 0;
        foreach (var item in pending)
        {
            try
            {
                var payload = JsonSerializer.Deserialize<DocumentProcessingMessage>(item.PayloadJson);
                if (payload is not null)
                {
                    await _queueService.EnqueueAsync(payload, cancellationToken);
                }
                item.MarkProcessed();
                dispatched++;
            }
            catch (Exception ex)
            {
                item.RecordFailure(ex.Message);
            }
        }

        if (pending.Count > 0)
            await _dbContext.SaveChangesAsync(cancellationToken);

        return dispatched;
    }

    /// <summary>
    /// Optional LLM stage. Its output is untrusted: it can only add review issues (max Warning),
    /// never change values, approve, or fail the document. Failures degrade to OCR-only + human review.
    /// </summary>
    private async Task<List<ValidationIssue>> RunAiAnalysisAsync(
        Document doc,
        Guid versionId,
        DocumentAnalysisResult analysis,
        CancellationToken cancellationToken)
    {
        var issues = new List<ValidationIssue>();
        try
        {
            var ai = await _aiAnalyzer.AnalyzeAsync(analysis.DetectedType, analysis.Fields, cancellationToken);
            if (ai is null)
                return issues;

            if (ai.SuggestedType != DocumentType.Unknown &&
                ai.SuggestedType != analysis.DetectedType &&
                ai.Confidence >= AiTypeMismatchMinConfidence)
            {
                issues.Add(new ValidationIssue(
                    doc.OrganizationId, doc.Id, versionId,
                    "AI_TYPE_MISMATCH", null, ValidationSeverity.Warning,
                    $"AI classified this document as {ai.SuggestedType} ({ai.Confidence:P0}) but OCR detected {analysis.DetectedType}."));
            }

            foreach (var finding in ai.Findings)
            {
                issues.Add(new ValidationIssue(
                    doc.OrganizationId, doc.Id, versionId,
                    finding.Code, finding.FieldName,
                    finding.Severity == AiFindingSeverity.Info ? ValidationSeverity.Info : ValidationSeverity.Warning,
                    $"[AI] {finding.Message}"));
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "AI analysis failed for document {DocumentId}; continuing with OCR only.", doc.Id);
            issues.Add(new ValidationIssue(
                doc.OrganizationId, doc.Id, versionId,
                "AI_ANALYSIS_UNAVAILABLE", null, ValidationSeverity.Warning,
                "AI analysis could not be completed; manual review required."));
        }

        return issues;
    }

    private static List<ValidationIssue> ValidateExtractedFields(
        Guid orgId,
        Guid docId,
        Guid versionId,
        DocumentType detectedType,
        List<ExtractedField> fields)
    {
        var issues = new List<ValidationIssue>();

        foreach (var field in fields)
        {
            if (new ConfidenceScore(field.Confidence).IsLowConfidence())
            {
                issues.Add(new ValidationIssue(
                    orgId, docId, versionId,
                    "LOW_CONFIDENCE",
                    field.FieldName,
                    ValidationSeverity.Warning,
                    $"Field '{field.FieldName}' has low extraction confidence ({field.Confidence:P0})."));
            }

            if (field.IsFinanciallySensitive &&
                decimal.TryParse(field.NormalizedValue ?? field.RawValue, out var amount) &&
                amount < 0)
            {
                issues.Add(new ValidationIssue(
                    orgId, docId, versionId,
                    "NEGATIVE_FINANCIAL_AMOUNT",
                    field.FieldName,
                    ValidationSeverity.Error,
                    $"Financial field '{field.FieldName}' cannot be negative."));
            }
        }

        if (detectedType == DocumentType.Invoice &&
            !fields.Any(f => string.Equals(f.FieldName, "TotalAmount", StringComparison.OrdinalIgnoreCase)))
        {
            issues.Add(new ValidationIssue(
                orgId, docId, versionId,
                "MISSING_INVOICE_TOTAL",
                "TotalAmount",
                ValidationSeverity.Error,
                "Invoice is missing required TotalAmount field."));
        }

        return issues;
    }
}

