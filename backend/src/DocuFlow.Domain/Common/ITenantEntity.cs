namespace DocuFlow.Domain.Common;

/// <summary>
/// Marker contract for all tenant-scoped entities.
/// Every query and command on these entities must enforce OrganizationId isolation.
/// </summary>
public interface ITenantEntity
{
    Guid OrganizationId { get; }
}

