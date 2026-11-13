using DocuFlow.Domain.Documents;
using DocuFlow.Domain.Extraction;

namespace DocuFlow.Application.Documents;

public sealed record PagedResult<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PageSize,
    int TotalCount);

public sealed record DocumentSummaryDto(
    Guid Id,
    string Title,
    DocumentType DocumentType,
    DocumentStatus Status,
    int CurrentVersionNumber,
    int RetryCount,
    DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt);

public sealed record DocumentVersionDto(
    Guid Id,
    int VersionNumber,
    string OriginalFileName,
    string ContentType,
    long SizeBytes,
    string Sha256Hash,
    DateTimeOffset CreatedAt);

public sealed record ExtractedFieldDto(
    Guid Id,
    string FieldName,
    string? RawValue,
    string? NormalizedValue,
    decimal Confidence,
    int? PageNumber,
    string? BoundingBoxJson,
    bool IsFinanciallySensitive,
    bool RequiresReview,
    string? CorrectedValue,
    bool IsValidated);

public sealed record ValidationIssueDto(
    Guid Id,
    string RuleCode,
    string? FieldName,
    ValidationSeverity Severity,
    string Message,
    bool IsResolved);

public sealed record DocumentDetailDto(
    Guid Id,
    string Title,
    DocumentType DocumentType,
    DocumentStatus Status,
    int CurrentVersionNumber,
    int RetryCount,
    string? LastError,
    Guid? ReviewedByUserId,
    DateTimeOffset? ReviewedAt,
    string? ReviewNotes,
    DateTimeOffset CreatedAt,
    IReadOnlyList<DocumentVersionDto> Versions,
    IReadOnlyList<ExtractedFieldDto> ExtractedFields,
    IReadOnlyList<ValidationIssueDto> ValidationIssues);

public sealed record CorrectFieldRequest(string CorrectedValue);
public sealed record ReviewDecisionRequest(string? Notes);
public sealed record RejectDocumentRequest(string Reason);

