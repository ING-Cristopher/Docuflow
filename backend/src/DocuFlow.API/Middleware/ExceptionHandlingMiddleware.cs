using DocuFlow.Domain.Common;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DocuFlow.API.Middleware;

public sealed class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (DomainException ex)
        {
            var statusCode = MapStatusCode(ex.Code);
            _logger.LogWarning("Domain error {Code}: {Message}", ex.Code, ex.Message);

            context.Response.StatusCode = statusCode;
            await context.Response.WriteAsJsonAsync(new ProblemDetails
            {
                Status = statusCode,
                Title = ex.Code,
                Detail = ex.Message
            });
        }
        catch (DbUpdateConcurrencyException ex)
        {
            _logger.LogWarning(ex, "Concurrency conflict while processing {Method} {Path}",
                context.Request.Method, context.Request.Path);

            context.Response.StatusCode = StatusCodes.Status409Conflict;
            await context.Response.WriteAsJsonAsync(new ProblemDetails
            {
                Status = StatusCodes.Status409Conflict,
                Title = "ConcurrencyConflict",
                Detail = "The resource was modified by another request. Please refresh and retry."
            });
        }
        catch (BadHttpRequestException ex)
        {
            context.Response.StatusCode = ex.StatusCode;
            await context.Response.WriteAsJsonAsync(new ProblemDetails
            {
                Status = ex.StatusCode,
                Title = "BadRequest",
                Detail = ex.Message
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception while processing request {Method} {Path}",
                context.Request.Method, context.Request.Path);

            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsJsonAsync(new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "InternalServerError",
                Detail = "An unexpected error occurred."
            });
        }
    }

    private static int MapStatusCode(string code) => code switch
    {
        "Auth.InvalidCredentials" or "Auth.Unauthenticated" => StatusCodes.Status401Unauthorized,
        "Auth.ForbiddenOrganization" or "Auth.NoOrganizationAccess" or "Auth.MissingTenantContext" or "Auth.MissingOrganization" or "Auth.InsufficientPermissions" => StatusCodes.Status403Forbidden,
        "Document.NotFound" or "ExtractedField.NotFound" => StatusCodes.Status404NotFound,
        "Auth.EmailExists" or "Auth.SlugExists" or "Membership.AlreadyExists" => StatusCodes.Status409Conflict,
        _ => StatusCodes.Status400BadRequest
    };
}

