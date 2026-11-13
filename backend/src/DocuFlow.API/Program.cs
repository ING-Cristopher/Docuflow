using System.Security.Claims;
using System.Text;
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

builder.Services.AddControllers();
builder.Services.AddOpenApi();

var app = builder.Build();

app.UseMiddleware<ExceptionHandlingMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<DocuFlowDbContext>();
    if (db.Database.IsRelational())
    {
        await db.Database.MigrateAsync();
    }
    var initializer = scope.ServiceProvider.GetRequiredService<DbInitializer>();
    await initializer.SeedAsync();
}

app.UseCors("FrontendPolicy");
app.UseAuthentication();
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
