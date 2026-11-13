using DocuFlow.Domain.Common;

namespace DocuFlow.Domain.Extraction;

public enum ExtractionRunStatus
{
    Started = 1,
    Succeeded = 2,
    Failed = 3
}

public sealed class ExtractionRun : Entity, ITenantEntity
{
    public Guid OrganizationId { get; private set; }
    public Guid DocumentId { get; private set; }
    public Guid DocumentVersionId { get; private set; }
    public string ProviderName { get; private set; } = string.Empty;
    public string ModelId { get; private set; } = string.Empty;
    public ExtractionRunStatus Status { get; private set; } = ExtractionRunStatus.Started;
    public decimal? OverallConfidence { get; private set; }
    public string? RawResponseJson { get; private set; }
    public string? ErrorMessage { get; private set; }
    public DateTimeOffset StartedAt { get; private set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; private set; }

    private ExtractionRun() { }

    public ExtractionRun(
        Guid organizationId,
        Guid documentId,
        Guid documentVersionId,
        string providerName,
        string modelId)
    {
        if (organizationId == Guid.Empty)
            throw new DomainException("ExtractionRun.InvalidOrganization", "OrganizationId is required.");
        if (documentId == Guid.Empty || documentVersionId == Guid.Empty)
            throw new DomainException("ExtractionRun.InvalidDocument", "DocumentId and DocumentVersionId are required.");

        OrganizationId = organizationId;
        DocumentId = documentId;
        DocumentVersionId = documentVersionId;
        ProviderName = providerName.Trim();
        ModelId = modelId.Trim();
    }

    public void MarkSucceeded(ConfidenceScore overallConfidence, string rawResponseJson)
    {
        Status = ExtractionRunStatus.Succeeded;
        OverallConfidence = overallConfidence.Value;
        RawResponseJson = rawResponseJson;
        CompletedAt = DateTimeOffset.UtcNow;
        Touch();
    }

    public void MarkFailed(string errorMessage)
    {
        Status = ExtractionRunStatus.Failed;
        ErrorMessage = errorMessage;
        CompletedAt = DateTimeOffset.UtcNow;
        Touch();
    }
}

