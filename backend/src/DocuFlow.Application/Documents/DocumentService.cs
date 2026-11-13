using System.Text.Json;
using DocuFlow.Application.Abstractions;
using DocuFlow.Domain.Auditing;
using DocuFlow.Domain.Common;
using DocuFlow.Domain.Documents;
using Microsoft.EntityFrameworkCore;

namespace DocuFlow.Application.Documents;

public sealed class DocumentService
{
    private readonly IApplicationDbContext _dbContext;
    private readonly ITenantContext _tenantContext;
    private readonly IBlobStorageService _blobStorage;
    private readonly IDocumentQueueService _queueService;

    public DocumentService(
        IApplicationDbContext dbContext,
        ITenantContext tenantContext,
        IBlobStorageService blobStorage,
        IDocumentQueueService queueService)
    {
        _dbContext = dbContext;
        _tenantContext = tenantContext;
        _blobStorage = blobStorage;
        _queueService = queueService;
    }

    public async Task<DocumentSummaryDto> UploadAsync(
        string title,
        DocumentType documentType,
        string fileName,
        string contentType,
        long sizeBytes,
        Stream content,
        CancellationToken cancellationToken = default)
    {
        var (orgId, userId) = RequireTenantUser();
        var sanitized = FileValidationHelper.SanitizeFileName(fileName);
        var sha256 = await FileValidationHelper.ValidateAndComputeSha256Async(
            content, sanitized, contentType, sizeBytes, cancellationToken);

        var doc = new Document(orgId, userId, title, documentType);
        var blobPath = $"{orgId}/{doc.Id}/v1/{sanitized}";

        await _blobStorage.UploadAsync(blobPath, content, contentType, cancellationToken);

        var version = doc.AddVersion(
            sanitized,
            contentType,
            sizeBytes,
            sha256,
            _blobStorage.ContainerName,
            blobPath,
            userId);

        doc.MarkQueued();

        var message = new DocumentProcessingMessage(orgId, doc.Id, version.Id);
        var outbox = new OutboxMessage(orgId, "DocumentQueued", JsonSerializer.Serialize(message));

        _dbContext.Documents.Add(doc);
        _dbContext.AuditLogs.Add(new AuditLog(orgId, userId, "DocumentUploaded", nameof(Document), doc.Id));
        _dbContext.OutboxMessages.Add(outbox);
        await _dbContext.SaveChangesAsync(cancellationToken);

        try
        {
            await _queueService.EnqueueAsync(message, cancellationToken);
            outbox.MarkProcessed();
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            // Outbox relay in Worker will retry publishing this message reliably.
        }

        return new DocumentSummaryDto(
            doc.Id, doc.Title, doc.DocumentType, doc.Status,
            doc.CurrentVersionNumber, doc.RetryCount, doc.CreatedAt, doc.UpdatedAt);
    }

    public async Task<PagedResult<DocumentSummaryDto>> GetPagedAsync(
        int page = 1,
        int pageSize = 20,
        DocumentStatus? status = null,
        DocumentType? documentType = null,
        string? search = null,
        CancellationToken cancellationToken = default)
    {
        RequireTenantUser();
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _dbContext.Documents.AsNoTracking().AsQueryable();

        if (status.HasValue)
            query = query.Where(d => d.Status == status.Value);

        if (documentType.HasValue)
            query = query.Where(d => d.DocumentType == documentType.Value);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(d => d.Title.Contains(term));
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(d => d.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(d => new DocumentSummaryDto(
                d.Id, d.Title, d.DocumentType, d.Status,
                d.CurrentVersionNumber, d.RetryCount, d.CreatedAt, d.UpdatedAt))
            .ToListAsync(cancellationToken);

        return new PagedResult<DocumentSummaryDto>(items, page, pageSize, totalCount);
    }

    public async Task<DocumentDetailDto?> GetByIdAsync(Guid documentId, CancellationToken cancellationToken = default)
    {
        RequireTenantUser();

        var doc = await _dbContext.Documents
            .AsNoTracking()
            .Include(d => d.Versions)
            .FirstOrDefaultAsync(d => d.Id == documentId, cancellationToken);

        if (doc is null)
            return null;

        var fields = await _dbContext.ExtractedFields
            .AsNoTracking()
            .Where(f => f.DocumentId == doc.Id && f.DocumentVersionId == doc.LatestVersionId)
            .OrderBy(f => f.FieldName)
            .Select(f => new ExtractedFieldDto(
                f.Id, f.FieldName, f.RawValue, f.NormalizedValue, f.Confidence,
                f.PageNumber, f.BoundingBoxJson, f.IsFinanciallySensitive,
                f.RequiresReview, f.CorrectedValue, f.IsValidated))
            .ToListAsync(cancellationToken);

        var issues = await _dbContext.ValidationIssues
            .AsNoTracking()
            .Where(v => v.DocumentId == doc.Id && v.DocumentVersionId == doc.LatestVersionId)
            .Select(v => new ValidationIssueDto(
                v.Id, v.RuleCode, v.FieldName, v.Severity, v.Message, v.IsResolved))
            .ToListAsync(cancellationToken);

        var versions = doc.Versions
            .OrderByDescending(v => v.VersionNumber)
            .Select(v => new DocumentVersionDto(
                v.Id, v.VersionNumber, v.OriginalFileName, v.ContentType,
                v.SizeBytes, v.Sha256Hash, v.CreatedAt))
            .ToList();

        return new DocumentDetailDto(
            doc.Id, doc.Title, doc.DocumentType, doc.Status,
            doc.CurrentVersionNumber, doc.RetryCount, doc.LastError,
            doc.ReviewedByUserId, doc.ReviewedAt, doc.ReviewNotes,
            doc.CreatedAt, versions, fields, issues);
    }

    public async Task<(Stream Content, string ContentType, string FileName)?> DownloadLatestAsync(
        Guid documentId,
        CancellationToken cancellationToken = default)
    {
        var (orgId, userId) = RequireTenantUser();

        var doc = await _dbContext.Documents
            .AsNoTracking()
            .Include(d => d.Versions)
            .FirstOrDefaultAsync(d => d.Id == documentId, cancellationToken);

        var latest = doc?.Versions.FirstOrDefault(v => v.Id == doc.LatestVersionId);
        if (latest is null)
            return null;

        var stream = await _blobStorage.DownloadAsync(latest.BlobPath, cancellationToken);
        _dbContext.AuditLogs.Add(new AuditLog(orgId, userId, "DocumentDownloaded", nameof(Document), documentId));
        await _dbContext.SaveChangesAsync(cancellationToken);

        return (stream, latest.ContentType, latest.OriginalFileName);
    }

    private (Guid OrganizationId, Guid UserId) RequireTenantUser()
    {
        if (!_tenantContext.HasOrganizationContext || _tenantContext.UserId is null)
            throw new DomainException("Auth.MissingTenantContext", "Authenticated organization context is required.");
        return (_tenantContext.OrganizationId!.Value, _tenantContext.UserId.Value);
    }
}

