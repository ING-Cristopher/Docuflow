using DocuFlow.Domain.Tenancy;

namespace DocuFlow.Application.Security;

public sealed record RegisterOrganizationRequest(
    string OrganizationName,
    string OrganizationSlug,
    string FullName,
    string Email,
    string Password);

public sealed record LoginRequest(
    string Email,
    string Password,
    string? OrganizationSlug = null);

public sealed record SwitchOrganizationRequest(Guid OrganizationId);

public sealed record InviteMemberRequest(
    string Email,
    string FullName,
    string TemporaryPassword,
    OrganizationRole Role);

public sealed record UpdateMemberRoleRequest(OrganizationRole Role);

public sealed record UserMembershipDto(
    Guid OrganizationId,
    string OrganizationName,
    string OrganizationSlug,
    OrganizationRole Role);

public sealed record AuthResponse(
    string AccessToken,
    Guid UserId,
    string Email,
    string FullName,
    Guid OrganizationId,
    string OrganizationSlug,
    OrganizationRole Role);

