using System.Text.Json;
using DocuFlow.Application.Abstractions;
using DocuFlow.Application.Processing;
using DocuFlow.Domain.Documents;
using DocuFlow.Domain.Tenancy;
using DocuFlow.Infrastructure.AI;
using DocuFlow.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace DocuFlow.IntegrationTests.Processing;

public sealed class AiAnalysisTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    public AiAnalysisTests() => _connection.Open();

    public void Dispose() => _connection.Dispose();

    private static string GeminiBody(object payload) => JsonSerializer.Serialize(new
    {
        candidates = new[]
        {
            new { content = new { parts = new[] { new { text = JsonSerializer.Serialize(payload) } } } }
        }
    });

    [Fact]
    public void Parse_ValidResponse_MapsTypeConfidenceAndFindings()
    {
        var body = GeminiBody(new
        {
            documentType = "Receipt",
            confidence = 0.93,
            findings = new[] { new { fieldName = "TotalAmount", severity = "warning", message = "Total != subtotal + tax" } }
        });

        var result = GeminiDocumentAnalyzer.Parse(body, "gemini-2.5-flash");

        Assert.Equal(DocumentType.Receipt, result.SuggestedType);
        Assert.Equal(0.93m, result.Confidence);
        var finding = Assert.Single(result.Findings);
        Assert.Equal("TotalAmount", finding.FieldName);
        Assert.Equal(AiFindingSeverity.Warning, finding.Severity);
    }

    [Fact]
    public void Parse_UnknownTypeAndOutOfRangeConfidence_AreSanitized()
    {
        var body = GeminiBody(new { documentType = "Hacked", confidence = 7, findings = Array.Empty<object>() });

        var result = GeminiDocumentAnalyzer.Parse(body, "m");

        Assert.Equal(DocumentType.Unknown, result.SuggestedType);
        Assert.Equal(1m, result.Confidence);
    }

    [Fact]
    public void Parse_MalformedJson_Throws()
    {
        Assert.ThrowsAny<Exception>(() => GeminiDocumentAnalyzer.Parse("{\"candidates\":[]}", "m"));
    }

    [Fact]
    public async Task Pipeline_AiTypeMismatch_AddsWarningButKeepsOcrType()
    {
        var ai = new FakeAnalyzer(new AiAnalysisResult("Fake", "f", DocumentType.Contract, 0.95m,
            [new AiFinding("AI_FINDING", "TotalAmount", AiFindingSeverity.Warning, "suspicious")]));

        var (db, doc) = await RunAsync(ai);

        Assert.Equal(DocumentType.Invoice, doc.DocumentType);
        Assert.Equal(DocumentStatus.PendingReview, doc.Status);
        var codes = await db.ValidationIssues.IgnoreQueryFilters().Select(i => i.RuleCode).ToListAsync();
        Assert.Contains("AI_TYPE_MISMATCH", codes);
        Assert.Contains("AI_FINDING", codes);
    }

    [Fact]
    public async Task Pipeline_AiFailure_DoesNotFailDocument_AndRequiresReview()
    {
        var (db, doc) = await RunAsync(new FakeAnalyzer(null, throws: true));

        Assert.Equal(DocumentStatus.PendingReview, doc.Status);
        var codes = await db.ValidationIssues.IgnoreQueryFilters().Select(i => i.RuleCode).ToListAsync();
        Assert.Contains("AI_ANALYSIS_UNAVAILABLE", codes);
    }

    [Fact]
    public async Task Pipeline_AiDisabled_AddsNoAiIssues()
    {
        var (db, _) = await RunAsync(new DisabledDocumentAiAnalyzer());

        var codes = await db.ValidationIssues.IgnoreQueryFilters().Select(i => i.RuleCode).ToListAsync();
        Assert.DoesNotContain(codes, c => c.StartsWith("AI_"));
    }

    private async Task<(DocuFlowDbContext Db, Document Doc)> RunAsync(IDocumentAiAnalyzer analyzer)
    {
        var options = new DbContextOptionsBuilder<DocuFlowDbContext>().UseSqlite(_connection).Options;
        var db = new DocuFlowDbContext(options, tenantContext: null);
        await db.Database.EnsureCreatedAsync();

        var org = new Organization("Org", "org-ai");
        var user = new User("ai@org.com", "AI User", "hash");
        db.Organizations.Add(org);
        db.Users.Add(user);

        var doc = new Document(org.Id, user.Id, "Invoice", DocumentType.Invoice);
        var version = doc.AddVersion("a.pdf", "application/pdf", 3, "hash", "documents", "p/a.pdf", user.Id);
        doc.MarkQueued();
        db.Documents.Add(doc);
        await db.SaveChangesAsync();

        var service = new DocumentProcessingService(
            db, new FakeBlob(), new DocuFlow.Infrastructure.AI.MockDocumentIntelligenceService(),
            analyzer, new FakeQueue(), NullLogger<DocumentProcessingService>.Instance);

        await service.ProcessAsync(new DocumentProcessingMessage(org.Id, doc.Id, version.Id));

        var reloaded = await db.Documents.IgnoreQueryFilters().AsNoTracking().FirstAsync(d => d.Id == doc.Id);
        return (db, reloaded);
    }

    private sealed class FakeAnalyzer(AiAnalysisResult? result, bool throws = false) : IDocumentAiAnalyzer
    {
        public Task<AiAnalysisResult?> AnalyzeAsync(
            DocumentType t, IReadOnlyList<ExtractedFieldCandidate> f, CancellationToken ct = default) =>
            throws ? throw new HttpRequestException("boom") : Task.FromResult(result);
    }

    private sealed class FakeBlob : IBlobStorageService
    {
        public string ContainerName => "documents";
        public Task UploadAsync(string p, Stream c, string t, CancellationToken ct = default) => Task.CompletedTask;
        public Task<Stream> DownloadAsync(string p, CancellationToken ct = default) =>
            Task.FromResult<Stream>(new MemoryStream([1, 2, 3]));
    }

    private sealed class FakeQueue : IDocumentQueueService
    {
        public Task EnqueueAsync(DocumentProcessingMessage m, CancellationToken ct = default) => Task.CompletedTask;
        public Task<IReadOnlyList<QueuedDocumentEnvelope>> ReceiveBatchAsync(int max = 5, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<QueuedDocumentEnvelope>>([]);
        public Task CompleteAsync(string id, string pop, CancellationToken ct = default) => Task.CompletedTask;
    }
}
