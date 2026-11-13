using DocuFlow.Domain.Documents;

namespace DocuFlow.Application.Abstractions;

public sealed record ExtractedFieldCandidate(
    string FieldName,
    string? RawValue,
    string? NormalizedValue,
    decimal Confidence,
    int? PageNumber,
    string? BoundingBoxJson,
    bool IsFinanciallySensitive);

public sealed record DocumentAnalysisResult(
    string ProviderName,
    string ModelId,
    DocumentType DetectedType,
    decimal OverallConfidence,
    string RawResponseJson,
    IReadOnlyList<ExtractedFieldCandidate> Fields);

public interface IDocumentIntelligenceService
{
    Task<DocumentAnalysisResult> AnalyzeAsync(
        Stream content,
        string contentType,
        CancellationToken cancellationToken = default);
}

