using DocuFlow.Domain.Common;

namespace DocuFlow.Domain.Auditing;

public sealed class AuditLog : Entity, ITenantEntity
{
    public Guid OrganizationId { get; private set; }
    public Guid? ActorUserId { get; private set; }
    public string Action { get; private set; } = string.Empty;
    public string EntityType { get; private set; } = string.Empty;
    public Guid? EntityId { get; private set; }
    public string? DetailsJson { get; private set; }
    public string? IpAddress { get; private set; }
    public DateTimeOffset OccurredAt { get; private set; } = DateTimeOffset.UtcNow;

    private AuditLog() { }

    public AuditLog(
        Guid organizationId,
        Guid? actorUserId,
        string action,
        string entityType,
        Guid? entityId = null,
        string? detailsJson = null,
        string? ipAddress = null)
    {
        if (organizationId == Guid.Empty)
            throw new DomainException("AuditLog.InvalidOrganization", "OrganizationId is required.");
        if (string.IsNullOrWhiteSpace(action))
            throw new DomainException("AuditLog.InvalidAction", "Action is required.");
        if (string.IsNullOrWhiteSpace(entityType))
            throw new DomainException("AuditLog.InvalidEntityType", "EntityType is required.");

        OrganizationId = organizationId;
        ActorUserId = actorUserId;
        Action = action.Trim();
        EntityType = entityType.Trim();
        EntityId = entityId;
        DetailsJson = detailsJson;
        IpAddress = ipAddress;
    }
}

