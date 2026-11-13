using DocuFlow.API.Security;
using DocuFlow.Application.Auditing;
using DocuFlow.Application.Documents;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DocuFlow.API.Controllers;

[ApiController]
[Route("api/audit-logs")]
[Authorize(Policy = PolicyNames.RequireAdmin)]
public sealed class AuditLogsController : ControllerBase
{
    private readonly AuditService _auditService;

    public AuditLogsController(AuditService auditService)
    {
        _auditService = auditService;
    }

    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<AuditLogDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<AuditLogDto>>> GetPaged(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? action = null,
        CancellationToken cancellationToken = default)
    {
        var result = await _auditService.GetPagedAsync(page, pageSize, action, cancellationToken);
        return Ok(result);
    }
}

