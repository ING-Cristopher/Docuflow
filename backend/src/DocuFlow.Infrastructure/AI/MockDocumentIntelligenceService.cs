using System.Text.Json;
using DocuFlow.Application.Abstractions;
using DocuFlow.Domain.Documents;

namespace DocuFlow.Infrastructure.AI;

/// <summary>
/// Deterministic extractor used only when no Gemini API key is configured
/// (or DOCUMENT_INTELLIGENCE_FORCE_MOCK=true). Its values are synthetic
/// and preserve a stable contract for automated integration tests.
/// </summary>
public sealed class MockDocumentIntelligenceService : IDocumentIntelligenceService
{
    public Task<DocumentAnalysisResult> AnalyzeAsync(
        Stream content,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        var fields = new List<ExtractedFieldCandidate>
        {
            new("InvoiceNumber", "INV-2026-0001", "INV-2026-0001", 0.96m, 1, "[100,120,240,145]", false),
            new("VendorName", "Contoso Logistics LLC", "Contoso Logistics LLC", 0.91m, 1, "[100,160,320,185]", false),
            new("TotalAmount", "1250.00", "1250.00", 0.89m, 1, "[400,620,520,645]", true),
            new("TaxAmount", "150.00", "150.00", 0.82m, 1, "[400,590,520,615]", true)
        };

        var rawJson = JsonSerializer.Serialize(new
        {
            Provider = "MockDocumentIntelligence",
            ModelId = "mock-prebuilt-invoice",
            ContentType = contentType,
            Fields = fields.Count
        });

        return Task.FromResult(new DocumentAnalysisResult(
            "MockDocumentIntelligence",
            "mock-prebuilt-invoice",
            DocumentType.Invoice,
            0.895m,
            rawJson,
            fields));
    }
}
