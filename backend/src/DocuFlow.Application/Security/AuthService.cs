using DocuFlow.Application.Abstractions;
using DocuFlow.Domain.Auditing;
using DocuFlow.Domain.Common;
using DocuFlow.Domain.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace DocuFlow.Application.Security;

public sealed class AuthService
{
    private readonly IApplicationDbContext _dbContext;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IJwtTokenGenerator _jwtTokenGenerator;
    private readonly ITenantContext _tenantContext;

    public AuthService(
        IApplicationDbContext dbContext,
        IPasswordHasher passwordHasher,
        IJwtTokenGenerator jwtTokenGenerator,
        ITenantContext tenantContext)
    {
        _dbContext = dbContext;
        _passwordHasher = passwordHasher;
        _jwtTokenGenerator = jwtTokenGenerator;
        _tenantContext = tenantContext;
    }

    public async Task<AuthResponse> RegisterOrganizationAsync(
        RegisterOrganizationRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
            throw new DomainException("Auth.WeakPassword", "Password must be at least 8 characters long.");

        var normalizedEmail = request.Email.Trim().ToUpperInvariant();
        var normalizedSlug = request.OrganizationSlug.Trim().ToLowerInvariant();

        if (await _dbContext.Users.IgnoreQueryFilters().AnyAsync(u => u.NormalizedEmail == normalizedEmail, cancellationToken))
            throw new DomainException("Auth.EmailExists", "An account with this email already exists.");

        if (await _dbContext.Organizations.IgnoreQueryFilters().AnyAsync(o => o.Slug == normalizedSlug, cancellationToken))
            throw new DomainException("Auth.SlugExists", "An organization with this slug already exists.");

        var org = new Organization(request.OrganizationName, normalizedSlug);
        var user = new User(request.Email, request.FullName, _passwordHasher.Hash(request.Password));
        var membership = new OrganizationMembership(org.Id, user.Id, OrganizationRole.Owner);
        var audit = new AuditLog(org.Id, user.Id, "OrganizationRegistered", nameof(Organization), org.Id);

        _dbContext.Organizations.Add(org);
        _dbContext.Users.Add(user);
        _dbContext.OrganizationMemberships.Add(membership);
        _dbContext.AuditLogs.Add(audit);
        await _dbContext.SaveChangesAsync(cancellationToken);

        var token = _jwtTokenGenerator.GenerateToken(user, org, membership.Role);
        return new AuthResponse(token, user.Id, user.Email, user.FullName, org.Id, org.Slug, membership.Role);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken cancellationToken = default)
    {
        var normalizedEmail = request.Email.Trim().ToUpperInvariant();
        var user = await _dbContext.Users
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.NormalizedEmail == normalizedEmail && u.IsActive, cancellationToken);

        if (user is null || !_passwordHasher.Verify(request.Password, user.PasswordHash))
            throw new DomainException("Auth.InvalidCredentials", "Invalid email or password.");

        var membershipsQuery = _dbContext.OrganizationMemberships
            .IgnoreQueryFilters()
            .Include(m => m.Organization)
            .Where(m => m.UserId == user.Id && m.IsActive && m.Organization != null && m.Organization.IsActive);

        OrganizationMembership? membership;
        if (!string.IsNullOrWhiteSpace(request.OrganizationSlug))
        {
            var slug = request.OrganizationSlug.Trim().ToLowerInvariant();
            membership = await membershipsQuery.FirstOrDefaultAsync(m => m.Organization!.Slug == slug, cancellationToken);
        }
        else
        {
            membership = await membershipsQuery.OrderBy(m => m.JoinedAt).FirstOrDefaultAsync(cancellationToken);
        }

        if (membership?.Organization is null)
            throw new DomainException("Auth.NoOrganizationAccess", "User does not have access to the requested organization.");

        var token = _jwtTokenGenerator.GenerateToken(user, membership.Organization, membership.Role);
        return new AuthResponse(
            token,
            user.Id,
            user.Email,
            user.FullName,
            membership.OrganizationId,
            membership.Organization.Slug,
            membership.Role);
    }

    public async Task<AuthResponse> SwitchOrganizationAsync(
        Guid targetOrganizationId,
        CancellationToken cancellationToken = default)
    {
        if (_tenantContext.UserId is null || _tenantContext.UserId == Guid.Empty)
            throw new DomainException("Auth.Unauthenticated", "User is not authenticated.");

        var userId = _tenantContext.UserId.Value;
        var membership = await _dbContext.OrganizationMemberships
            .IgnoreQueryFilters()
            .Include(m => m.Organization)
            .Include(m => m.User)
            .FirstOrDefaultAsync(
                m => m.UserId == userId
                     && m.OrganizationId == targetOrganizationId
                     && m.IsActive
                     && m.Organization != null
                     && m.Organization.IsActive
                     && m.User != null
                     && m.User.IsActive,
                cancellationToken);

        if (membership?.Organization is null || membership.User is null)
            throw new DomainException("Auth.ForbiddenOrganization", "You are not an active member of the target organization.");

        var token = _jwtTokenGenerator.GenerateToken(membership.User, membership.Organization, membership.Role);
        return new AuthResponse(
            token,
            membership.User.Id,
            membership.User.Email,
            membership.User.FullName,
            membership.OrganizationId,
            membership.Organization.Slug,
            membership.Role);
    }

    public async Task<IReadOnlyList<UserMembershipDto>> GetMyMembershipsAsync(CancellationToken cancellationToken = default)
    {
        if (_tenantContext.UserId is null)
            throw new DomainException("Auth.Unauthenticated", "User is not authenticated.");

        var userId = _tenantContext.UserId.Value;
        return await _dbContext.OrganizationMemberships
            .IgnoreQueryFilters()
            .Where(m => m.UserId == userId && m.IsActive && m.Organization != null && m.Organization.IsActive)
            .Select(m => new UserMembershipDto(
                m.OrganizationId,
                m.Organization!.Name,
                m.Organization.Slug,
                m.Role))
            .ToListAsync(cancellationToken);
    }

    public async Task<UserMembershipDto> AddMemberAsync(
        InviteMemberRequest request,
        CancellationToken cancellationToken = default)
    {
        var orgId = RequireCurrentOrganizationId();

        if (request.Role == OrganizationRole.Owner && _tenantContext.Role != OrganizationRole.Owner)
            throw new DomainException("Auth.InsufficientPermissions", "Only an organization Owner can assign the Owner role.");

        var normalizedEmail = request.Email.Trim().ToUpperInvariant();

        var user = await _dbContext.Users
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.NormalizedEmail == normalizedEmail, cancellationToken);

        if (user is not null && !user.IsActive)
            throw new DomainException("Auth.UserInactive", "Target user account is inactive.");

        if (user is null)
        {
            if (string.IsNullOrWhiteSpace(request.TemporaryPassword) || request.TemporaryPassword.Length < 8)
                throw new DomainException("Auth.WeakPassword", "Temporary password must be at least 8 characters long.");

            user = new User(request.Email, request.FullName, _passwordHasher.Hash(request.TemporaryPassword));
            _dbContext.Users.Add(user);
        }

        var exists = await _dbContext.OrganizationMemberships
            .AnyAsync(m => m.OrganizationId == orgId && m.UserId == user.Id, cancellationToken);

        if (exists)
            throw new DomainException("Membership.AlreadyExists", "User is already a member of this organization.");

        var membership = new OrganizationMembership(orgId, user.Id, request.Role);
        _dbContext.OrganizationMemberships.Add(membership);
        _dbContext.AuditLogs.Add(new AuditLog(
            orgId,
            _tenantContext.UserId,
            "MemberAdded",
            nameof(OrganizationMembership),
            membership.Id));

        await _dbContext.SaveChangesAsync(cancellationToken);

        var org = await _dbContext.Organizations.FirstAsync(o => o.Id == orgId, cancellationToken);
        return new UserMembershipDto(org.Id, org.Name, org.Slug, membership.Role);
    }

    private Guid RequireCurrentOrganizationId()
    {
        if (!_tenantContext.HasOrganizationContext)
            throw new DomainException("Auth.MissingOrganization", "Active organization context is required.");
        return _tenantContext.OrganizationId!.Value;
    }
}

