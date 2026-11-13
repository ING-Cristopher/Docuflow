using System.Security.Claims;
using DocuFlow.Application.Abstractions;
using DocuFlow.Domain.Tenancy;
using DocuFlow.Infrastructure.Security;

namespace DocuFlow.API.Security;

/// <summary>
/// Resolves tenant and user identity strictly from the authenticated JWT ClaimsPrincipal.
/// Never trusts organization identifiers from headers, query strings, or request bodies.
/// </summary>
public sealed class HttpTenantContext : ITenantContext
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public HttpTenantContext(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public Guid? OrganizationId
    {
        get
        {
            var raw = _httpContextAccessor.HttpContext?.User?.FindFirstValue(JwtTokenGenerator.OrganizationIdClaim);
            return Guid.TryParse(raw, out var id) ? id : null;
        }
    }

    public Guid? UserId
    {
        get
        {
            var raw = _httpContextAccessor.HttpContext?.User?.FindFirstValue(ClaimTypes.NameIdentifier);
            return Guid.TryParse(raw, out var id) ? id : null;
        }
    }

    public OrganizationRole? Role
    {
        get
        {
            var raw = _httpContextAccessor.HttpContext?.User?.FindFirstValue(ClaimTypes.Role);
            return Enum.TryParse<OrganizationRole>(raw, out var role) ? role : null;
        }
    }
}

public static class PolicyNames
{
    public const string RequireViewer = nameof(RequireViewer);
    public const string RequireReviewer = nameof(RequireReviewer);
    public const string RequireOperator = nameof(RequireOperator);
    public const string RequireAdmin = nameof(RequireAdmin);
    public const string RequireOwner = nameof(RequireOwner);
}

