using DocuFlow.Domain.Common;

namespace DocuFlow.Domain.Extraction;

public enum ValidationSeverity
{
    Info = 1,
    Warning = 2,
    Error = 3
}

public sealed class ValidationIssue : Entity, ITenantEntity
{
    public Guid OrganizationId { get; private set; }
    public Guid DocumentId { get; private set; }
    public Guid DocumentVersionId { get; private set; }
    public string RuleCode { get; private set; } = string.Empty;
    public string? FieldName { get; private set; }
    public ValidationSeverity Severity { get; private set; }
    public string Message { get; private set; } = string.Empty;
    public bool IsResolved { get; private set; }
    public Guid? ResolvedByUserId { get; private set; }
    public DateTimeOffset? ResolvedAt { get; private set; }

    private ValidationIssue() { }

    public ValidationIssue(
        Guid organizationId,
        Guid documentId,
        Guid documentVersionId,
        string ruleCode,
        string? fieldName,
        ValidationSeverity severity,
        string message)
    {
        if (organizationId == Guid.Empty)
            throw new DomainException("ValidationIssue.InvalidOrganization", "OrganizationId is required.");

        OrganizationId = organizationId;
        DocumentId = documentId;
        DocumentVersionId = documentVersionId;
        RuleCode = ruleCode.Trim();
        FieldName = fieldName?.Trim();
        Severity = severity;
        Message = message.Trim();
    }

    public void Resolve(Guid userId)
    {
        if (userId == Guid.Empty)
            throw new DomainException("ValidationIssue.InvalidUser", "UserId is required.");

        IsResolved = true;
        ResolvedByUserId = userId;
        ResolvedAt = DateTimeOffset.UtcNow;
        Touch();
    }
}

