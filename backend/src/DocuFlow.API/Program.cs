using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using DocuFlow.API.Middleware;
using DocuFlow.API.Security;
using DocuFlow.Application;
using DocuFlow.Application.Abstractions;
using DocuFlow.Domain.Tenancy;
using DocuFlow.Infrastructure;
using DocuFlow.Infrastructure.Persistence;
using DocuFlow.Infrastructure.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ITenantContext, HttpTenantContext>();

builder.Services.AddApplicationServices();
builder.Services.AddInfrastructurePersistence(builder.Configuration);

var jwtSecret = builder.Configuration["Jwt:SecretKey"] ?? builder.Configuration["JWT_SECRET_KEY"];
if (string.IsNullOrWhiteSpace(jwtSecret) || jwtSecret.Length < 32)
{
    if (builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("Testing"))
    {
        jwtSecret = "DOCUFLOW_DEV_ONLY_FALLBACK_KEY_MIN_32_CHARS";
    }
    else
    {
        throw new InvalidOperationException("JWT SecretKey must be configured with at least 32 characters in non-development environments.");
    }
}

var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? builder.Configuration["JWT_ISSUER"] ?? "DocuFlow.Api";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? builder.Configuration["JWT_AUDIENCE"] ?? "DocuFlow.Client";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,
            ValidateAudience = true,
            ValidAudience = jwtAudience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async context =>
            {
                var userIdRaw = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
                var orgIdRaw = context.Principal?.FindFirstValue(JwtTokenGenerator.OrganizationIdClaim);

                if (!Guid.TryParse(userIdRaw, out var userId) || !Guid.TryParse(orgIdRaw, out var orgId))
                {
                    context.Fail("Missing required identity or organization claims.");
                    return;
                }

                var db = context.HttpContext.RequestServices.GetRequiredService<DocuFlowDbContext>();
                var isActiveMember = await db.OrganizationMemberships
                    .IgnoreQueryFilters()
                    .AnyAsync(
                        m => m.UserId == userId
                             && m.OrganizationId == orgId
                             && m.IsActive
                             && m.User != null && m.User.IsActive
                             && m.Organization != null && m.Organization.IsActive,
                        context.HttpContext.RequestAborted);

                if (!isActiveMember)
                {
                    context.Fail("Membership or user account is no longer active.");
                }
            }
        };
    });

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? (string.IsNullOrWhiteSpace(builder.Configuration["FRONTEND_ORIGIN"])
        ? ["http://localhost:5173", "http://localhost:5174"]
        : [builder.Configuration["FRONTEND_ORIGIN"]!]);

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
        policy.WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials());
});

builder.Services.AddAuthorizationBuilder()
    .AddPolicy(PolicyNames.RequireViewer, p => p.RequireRole(
        nameof(OrganizationRole.Viewer), nameof(OrganizationRole.Reviewer), nameof(OrganizationRole.Operator), nameof(OrganizationRole.Admin), nameof(OrganizationRole.Owner)))
    .AddPolicy(PolicyNames.RequireReviewer, p => p.RequireRole(
        nameof(OrganizationRole.Reviewer), nameof(OrganizationRole.Admin), nameof(OrganizationRole.Owner)))
    .AddPolicy(PolicyNames.RequireOperator, p => p.RequireRole(
        nameof(OrganizationRole.Operator), nameof(OrganizationRole.Admin), nameof(OrganizationRole.Owner)))
    .AddPolicy(PolicyNames.RequireAdmin, p => p.RequireRole(
        nameof(OrganizationRole.Admin), nameof(OrganizationRole.Owner)))
    .AddPolicy(PolicyNames.RequireOwner, p => p.RequireRole(
        nameof(OrganizationRole.Owner)));

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, token) =>
    {
        context.HttpContext.Response.ContentType = "application/problem+json";
        await context.HttpContext.Response.WriteAsJsonAsync(new Microsoft.AspNetCore.Mvc.ProblemDetails
        {
            Status = StatusCodes.Status429TooManyRequests,
            Title = "RateLimitExceeded",
            Detail = "Has superado el límite de consultas al asistente de IA. Intenta nuevamente en unos segundos."
        }, token);
    };

    options.AddPolicy("agent-chat", httpContext =>
    {
        var userKey = httpContext.User.FindFirstValue(ClaimTypes.NameIdentifier);
        var partitionKey = !string.IsNullOrWhiteSpace(userKey)
            ? $"user:{userKey}"
            : $"ip:{httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown"}";

        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey,
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            });
    });
});

builder.Services.AddControllers();
builder.Services.AddOpenApi();

var app = builder.Build();

app.UseMiddleware<ExceptionHandlingMiddleware>();

app.Use(async (context, next) =>
{
    context.Response.Headers.TryAdd("X-Content-Type-Options", "nosniff");
    context.Response.Headers.TryAdd("X-Frame-Options", "DENY");
    context.Response.Headers.TryAdd("Referrer-Policy", "strict-origin-when-cross-origin");
    context.Response.Headers.TryAdd("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    await next();
});

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

if (!app.Environment.IsEnvironment("Testing"))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<DocuFlowDbContext>();
    if (db.Database.IsRelational())
    {
        await db.Database.MigrateAsync();
    }

    var seedDemoData = string.Equals(
        app.Configuration["SEED_DEMO_DATA"] ?? app.Configuration["Database:SeedDemoData"],
        "true",
        StringComparison.OrdinalIgnoreCase);

    if (app.Environment.IsDevelopment() && seedDemoData)
    {
        var initializer = scope.ServiceProvider.GetRequiredService<DbInitializer>();
        await initializer.SeedAsync();
    }
}

app.UseCors("FrontendPolicy");
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();

app.MapGet("/health", async (DocuFlowDbContext db, CancellationToken ct) =>
{
    var canConnect = await db.Database.CanConnectAsync(ct);
    return canConnect
        ? Results.Ok(new { status = "healthy", database = "connected" })
        : Results.Json(new { status = "unhealthy", database = "unreachable" }, statusCode: StatusCodes.Status503ServiceUnavailable);
}).AllowAnonymous();
app.MapControllers();

app.Run();

public partial class Program;
