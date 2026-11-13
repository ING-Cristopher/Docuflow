using DocuFlow.Domain.Common;

namespace DocuFlow.Domain.Tenancy;

public sealed class OrganizationMembership : Entity, ITenantEntity
{
    public Guid OrganizationId { get; private set; }
    public Guid UserId { get; private set; }
    public OrganizationRole Role { get; private set; }
    public bool IsActive { get; private set; } = true;
    public DateTimeOffset JoinedAt { get; private set; } = DateTimeOffset.UtcNow;

    public Organization? Organization { get; private set; }
    public User? User { get; private set; }

    private OrganizationMembership() { }

    public OrganizationMembership(Guid organizationId, Guid userId, OrganizationRole role)
    {
        if (organizationId == Guid.Empty)
            throw new DomainException("Membership.InvalidOrganization", "OrganizationId is required.");
        if (userId == Guid.Empty)
            throw new DomainException("Membership.InvalidUser", "UserId is required.");

        OrganizationId = organizationId;
        UserId = userId;
        Role = role;
    }

    public void ChangeRole(OrganizationRole newRole)
    {
        Role = newRole;
        Touch();
    }

    public void Deactivate()
    {
        IsActive = false;
        Touch();
    }
}

