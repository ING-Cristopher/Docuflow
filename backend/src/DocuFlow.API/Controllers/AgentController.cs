using DocuFlow.API.Security;
using DocuFlow.Application.Abstractions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace DocuFlow.API.Controllers;

[ApiController]
[Route("api/agent")]
[Authorize(Policy = PolicyNames.RequireViewer)]
[EnableRateLimiting("agent-chat")]
public sealed class AgentController : ControllerBase
{
    private readonly IDocumentAgentService _agentService;

    public AgentController(IDocumentAgentService agentService)
    {
        _agentService = agentService;
    }

    [HttpPost("chat")]
    [ProducesResponseType(typeof(AgentChatResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status429TooManyRequests)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<AgentChatResponse>> Chat(
        [FromBody] AgentChatRequest request,
        CancellationToken cancellationToken)
    {
        if (request.History is { Count: > AgentChatRequest.MaxHistoryTurns })
        {
            return BadRequest(new ProblemDetails
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "Agent.HistoryTooLong",
                Detail = $"El historial no puede superar los {AgentChatRequest.MaxHistoryTurns} turnos."
            });
        }

        var response = await _agentService.ChatAsync(request, cancellationToken);
        return Ok(response);
    }
}
