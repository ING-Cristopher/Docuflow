using DocuFlow.Application.Auditing;
using DocuFlow.Application.Documents;
using DocuFlow.Application.Processing;
using DocuFlow.Application.Security;
using Microsoft.Extensions.DependencyInjection;

namespace DocuFlow.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        services.AddScoped<AuthService>();
        services.AddScoped<DocumentService>();
        services.AddScoped<DocumentReviewService>();
        services.AddScoped<DocumentProcessingService>();
        services.AddScoped<AuditService>();
        return services;
    }
}

