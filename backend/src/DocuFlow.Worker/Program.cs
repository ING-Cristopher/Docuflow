using DocuFlow.Application;
using DocuFlow.Application.Abstractions;
using DocuFlow.Domain.Tenancy;
using DocuFlow.Infrastructure;
using DocuFlow.Worker;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddSingleton<ITenantContext, WorkerTenantContext>();
builder.Services.AddApplicationServices();
builder.Services.AddInfrastructurePersistence(builder.Configuration);
builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();

internal sealed class WorkerTenantContext : ITenantContext
{
    public Guid? OrganizationId => null;
    public Guid? UserId => null;
    public OrganizationRole? Role => null;
}
