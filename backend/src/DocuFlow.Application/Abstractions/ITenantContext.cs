using DocuFlow.Domain.Tenancy;

namespace DocuFlow.Application.Abstractions;

public interface ITenantContext
{
    Guid? OrganizationId { get; }
    Guid? UserId { get; }
    OrganizationRole? Role { get; }
    bool HasOrganizationContext => OrganizationId.HasValue && OrganizationId.Value != Guid.Empty;
}

