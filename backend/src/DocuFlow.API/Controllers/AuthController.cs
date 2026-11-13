using DocuFlow.API.Security;
using DocuFlow.Application.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DocuFlow.API.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly AuthService _authService;

    public AuthController(AuthService authService)
    {
        _authService = authService;
    }

    [AllowAnonymous]
    [HttpPost("register")]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status201Created)]
    public async Task<ActionResult<AuthResponse>> Register(
        [FromBody] RegisterOrganizationRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _authService.RegisterOrganizationAsync(request, cancellationToken);
        return Created(string.Empty, response);
    }

    [AllowAnonymous]
    [HttpPost("login")]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AuthResponse>> Login(
        [FromBody] LoginRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _authService.LoginAsync(request, cancellationToken);
        return Ok(response);
    }

    [Authorize]
    [HttpGet("memberships")]
    [ProducesResponseType(typeof(IReadOnlyList<UserMembershipDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<UserMembershipDto>>> GetMyMemberships(CancellationToken cancellationToken)
    {
        var memberships = await _authService.GetMyMembershipsAsync(cancellationToken);
        return Ok(memberships);
    }

    [Authorize]
    [HttpPost("switch-organization")]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AuthResponse>> SwitchOrganization(
        [FromBody] SwitchOrganizationRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _authService.SwitchOrganizationAsync(request.OrganizationId, cancellationToken);
        return Ok(response);
    }

    [Authorize(Policy = PolicyNames.RequireAdmin)]
    [HttpPost("members")]
    [ProducesResponseType(typeof(UserMembershipDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<UserMembershipDto>> AddMember(
        [FromBody] InviteMemberRequest request,
        CancellationToken cancellationToken)
    {
        var member = await _authService.AddMemberAsync(request, cancellationToken);
        return Created(string.Empty, member);
    }
}

