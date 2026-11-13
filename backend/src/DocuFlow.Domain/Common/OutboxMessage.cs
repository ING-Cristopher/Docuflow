namespace DocuFlow.Domain.Common;

public sealed class OutboxMessage : Entity, ITenantEntity
{
    public Guid OrganizationId { get; private set; }
    public string EventType { get; private set; } = string.Empty;
    public string PayloadJson { get; private set; } = string.Empty;
    public DateTimeOffset OccurredAt { get; private set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ProcessedAt { get; private set; }
    public int RetryCount { get; private set; }
    public string? LastError { get; private set; }

    private OutboxMessage() { }

    public OutboxMessage(Guid organizationId, string eventType, string payloadJson)
    {
        if (organizationId == Guid.Empty)
            throw new DomainException("Outbox.InvalidOrganization", "OrganizationId is required.");
        if (string.IsNullOrWhiteSpace(eventType))
            throw new DomainException("Outbox.InvalidEventType", "EventType is required.");

        OrganizationId = organizationId;
        EventType = eventType.Trim();
        PayloadJson = payloadJson;
    }

    public void MarkProcessed()
    {
        ProcessedAt = DateTimeOffset.UtcNow;
        LastError = null;
        Touch();
    }

    public void RecordFailure(string error)
    {
        RetryCount++;
        LastError = error;
        Touch();
    }
}

