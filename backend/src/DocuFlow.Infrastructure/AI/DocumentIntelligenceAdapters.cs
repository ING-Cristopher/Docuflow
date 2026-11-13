using System.Text.Json;
using Azure;
using Azure.AI.DocumentIntelligence;
using DocuFlow.Application.Abstractions;
using DocuFlow.Domain.Documents;

namespace DocuFlow.Infrastructure.AI;

public sealed class AzureDocumentIntelligenceService : IDocumentIntelligenceService
{
    private readonly DocumentIntelligenceClient _client;

    public AzureDocumentIntelligenceService(string endpoint, string apiKey)
    {
        _client = new DocumentIntelligenceClient(new Uri(endpoint), new AzureKeyCredential(apiKey));
    }

    public async Task<DocumentAnalysisResult> AnalyzeAsync(
        Stream content,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        var binaryData = await BinaryData.FromStreamAsync(content, cancellationToken);
        var operation = await _client.AnalyzeDocumentAsync(
            WaitUntil.Completed,
            "prebuilt-invoice",
            binaryData,
            cancellationToken);

        var result = operation.Value;
        var fields = new List<ExtractedFieldCandidate>();
        decimal confidenceSum = 0m;
        int confidenceCount = 0;

        if (result.Documents is not null)
        {
            foreach (var doc in result.Documents)
            {
                foreach (var kvp in doc.Fields)
                {
                    var conf = kvp.Value.Confidence.HasValue ? (decimal)kvp.Value.Confidence.Value : 0.50m;
                    confidenceSum += conf;
                    confidenceCount++;

                    var isFinancial = kvp.Key.Contains("Total", StringComparison.OrdinalIgnoreCase)
                                      || kvp.Key.Contains("Amount", StringComparison.OrdinalIgnoreCase)
                                      || kvp.Key.Contains("Tax", StringComparison.OrdinalIgnoreCase);

                    int? page = kvp.Value.BoundingRegions is { Count: > 0 } regions ? regions[0].PageNumber : null;
                    var bbox = kvp.Value.BoundingRegions is { Count: > 0 } regionsWithPoly && regionsWithPoly[0].Polygon is { } poly
                        ? JsonSerializer.Serialize(poly)
                        : null;

                    fields.Add(new ExtractedFieldCandidate(
                        kvp.Key,
                        kvp.Value.Content,
                        kvp.Value.Content?.Trim(),
                        Math.Clamp(conf, 0m, 1m),
                        page,
                        bbox,
                        isFinancial));
                }
            }
        }

        var overallConfidence = confidenceCount > 0
            ? Math.Clamp(confidenceSum / confidenceCount, 0m, 1m)
            : 0.50m;

        var rawJson = JsonSerializer.Serialize(new
        {
            result.ModelId,
            DocumentCount = result.Documents?.Count ?? 0,
            FieldCount = fields.Count
        });

        return new DocumentAnalysisResult(
            "AzureDocumentIntelligence",
            result.ModelId ?? "prebuilt-invoice",
            DocumentType.Invoice,
            overallConfidence,
            rawJson,
            fields);
    }
}

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
