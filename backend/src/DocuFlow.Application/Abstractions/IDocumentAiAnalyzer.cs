using DocuFlow.Domain.Documents;

namespace DocuFlow.Application.Abstractions;

public enum AiFindingSeverity
{
    Info = 1,
    Warning = 2
}

public sealed record AiFinding(
    string Code,
    string? FieldName,
    AiFindingSeverity Severity,
    string Message);

public sealed record AiAnalysisResult(
    string ProviderName,
    string ModelId,
    DocumentType SuggestedType,
    decimal Confidence,
    IReadOnlyList<AiFinding> Findings);

/// <summary>
/// Second-stage analysis over OCR output (classification + semantic cross-checks).
/// Output is untrusted: it can only add review signals, never approve or override values.
/// Returns null when AI analysis is disabled.
/// </summary>
public interface IDocumentAiAnalyzer
{
    Task<AiAnalysisResult?> AnalyzeAsync(
        DocumentType ocrDetectedType,
        IReadOnlyList<ExtractedFieldCandidate> fields,
        CancellationToken cancellationToken = default);
}
