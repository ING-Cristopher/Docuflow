using DocuFlow.Domain.Common;

namespace DocuFlow.Domain.Extraction;

public sealed class ExtractedField : Entity, ITenantEntity
{
    public Guid OrganizationId { get; private set; }
    public Guid DocumentId { get; private set; }
    public Guid DocumentVersionId { get; private set; }
    public string FieldName { get; private set; } = string.Empty;
    public string? RawValue { get; private set; }
    public string? NormalizedValue { get; private set; }
    public decimal Confidence { get; private set; }
    public int? PageNumber { get; private set; }
    public string? BoundingBoxJson { get; private set; }
    public bool IsFinanciallySensitive { get; private set; }
    public bool RequiresReview { get; private set; }
    public string? CorrectedValue { get; private set; }
    public Guid? CorrectedByUserId { get; private set; }
    public DateTimeOffset? CorrectedAt { get; private set; }
    public bool IsValidated { get; private set; }
    public byte[] RowVersion { get; private set; } = [];

    private ExtractedField() { }

    public ExtractedField(
        Guid organizationId,
        Guid documentId,
        Guid documentVersionId,
        string fieldName,
        string? rawValue,
        string? normalizedValue,
        ConfidenceScore confidence,
        int? pageNumber,
        string? boundingBoxJson,
        bool isFinanciallySensitive)
    {
        if (organizationId == Guid.Empty)
            throw new DomainException("ExtractedField.InvalidOrganization", "OrganizationId is required.");
        if (documentId == Guid.Empty || documentVersionId == Guid.Empty)
            throw new DomainException("ExtractedField.InvalidDocument", "DocumentId and DocumentVersionId are required.");
        if (string.IsNullOrWhiteSpace(fieldName))
            throw new DomainException("ExtractedField.InvalidFieldName", "FieldName is required.");

        OrganizationId = organizationId;
        DocumentId = documentId;
        DocumentVersionId = documentVersionId;
        FieldName = fieldName.Trim();
        RawValue = rawValue;
        NormalizedValue = normalizedValue;
        Confidence = confidence.Value;
        PageNumber = pageNumber;
        BoundingBoxJson = boundingBoxJson;
        IsFinanciallySensitive = isFinanciallySensitive;
        // Financially sensitive or low-confidence fields always require human review.
        RequiresReview = isFinanciallySensitive || confidence.IsLowConfidence();
        IsValidated = !RequiresReview;
    }

    public void ApplyManualCorrection(string correctedValue, Guid userId)
    {
        if (userId == Guid.Empty)
            throw new DomainException("ExtractedField.InvalidUser", "UserId is required.");

        CorrectedValue = correctedValue;
        CorrectedByUserId = userId;
        CorrectedAt = DateTimeOffset.UtcNow;
        RequiresReview = false;
        IsValidated = true;
        Touch();
    }

    public void MarkValidated()
    {
        RequiresReview = false;
        IsValidated = true;
        Touch();
    }
}

