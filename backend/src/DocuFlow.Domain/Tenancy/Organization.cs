using DocuFlow.Domain.Common;

namespace DocuFlow.Domain.Tenancy;

public sealed class Organization : Entity
{
    public string Name { get; private set; } = string.Empty;
    public string Slug { get; private set; } = string.Empty;
    public bool IsActive { get; private set; } = true;

    private readonly List<OrganizationMembership> _memberships = [];
    public IReadOnlyCollection<OrganizationMembership> Memberships => _memberships.AsReadOnly();

    private Organization() { }

    public Organization(string name, string slug)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new DomainException("Organization.InvalidName", "Organization name is required.");
        if (string.IsNullOrWhiteSpace(slug))
            throw new DomainException("Organization.InvalidSlug", "Organization slug is required.");

        Name = name.Trim();
        Slug = slug.Trim().ToLowerInvariant();
    }

    public void Deactivate()
    {
        IsActive = false;
        Touch();
    }
}

