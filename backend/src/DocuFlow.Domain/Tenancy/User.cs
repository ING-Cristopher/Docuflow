using DocuFlow.Domain.Common;

namespace DocuFlow.Domain.Tenancy;

public sealed class User : Entity
{
    public string Email { get; private set; } = string.Empty;
    public string NormalizedEmail { get; private set; } = string.Empty;
    public string FullName { get; private set; } = string.Empty;
    public string PasswordHash { get; private set; } = string.Empty;
    public bool IsActive { get; private set; } = true;

    private readonly List<OrganizationMembership> _memberships = [];
    public IReadOnlyCollection<OrganizationMembership> Memberships => _memberships.AsReadOnly();

    private User() { }

    public User(string email, string fullName, string passwordHash)
    {
        if (string.IsNullOrWhiteSpace(email))
            throw new DomainException("User.InvalidEmail", "Email is required.");
        if (string.IsNullOrWhiteSpace(fullName))
            throw new DomainException("User.InvalidFullName", "Full name is required.");
        if (string.IsNullOrWhiteSpace(passwordHash))
            throw new DomainException("User.InvalidPasswordHash", "Password hash is required.");

        Email = email.Trim();
        NormalizedEmail = Email.ToUpperInvariant();
        FullName = fullName.Trim();
        PasswordHash = passwordHash;
    }

    public void UpdatePasswordHash(string newPasswordHash)
    {
        if (string.IsNullOrWhiteSpace(newPasswordHash))
            throw new DomainException("User.InvalidPasswordHash", "Password hash cannot be empty.");

        PasswordHash = newPasswordHash;
        Touch();
    }
}

