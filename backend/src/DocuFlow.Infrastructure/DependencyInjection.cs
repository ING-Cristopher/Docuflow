using Azure.Storage.Blobs;
using Azure.Storage.Queues;
using DocuFlow.Application.Abstractions;
using DocuFlow.Infrastructure.AI;
using DocuFlow.Infrastructure.Messaging;
using DocuFlow.Infrastructure.Persistence;
using DocuFlow.Infrastructure.Security;
using DocuFlow.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace DocuFlow.Infrastructure;

public static class DependencyInjection
{
    public const string DocumentQueueName = "document-processing";

    public static IServiceCollection AddInfrastructurePersistence(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? configuration["POSTGRES_CONNECTION_STRING"]
            ?? throw new InvalidOperationException("PostgreSQL connection string is not configured.");

        services.AddDbContext<DocuFlowDbContext>(options =>
            options.UseNpgsql(connectionString, npgsql =>
                npgsql.MigrationsAssembly(typeof(DocuFlowDbContext).Assembly.FullName)));

        services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<DocuFlowDbContext>());
        services.AddSingleton<IPasswordHasher, Pbkdf2PasswordHasher>();
        services.Configure<JwtOptions>(options =>
        {
            var section = configuration.GetSection(JwtOptions.SectionName);
            options.SecretKey = section["SecretKey"] ?? configuration["JWT_SECRET_KEY"] ?? string.Empty;
            options.Issuer = section["Issuer"] ?? configuration["JWT_ISSUER"] ?? "DocuFlow.Api";
            options.Audience = section["Audience"] ?? configuration["JWT_AUDIENCE"] ?? "DocuFlow.Client";
            if (int.TryParse(section["ExpirationMinutes"], out var exp))
                options.ExpirationMinutes = exp;
        });
        services.AddSingleton<IJwtTokenGenerator, JwtTokenGenerator>();
        services.AddScoped<DbInitializer>();

        var storageConn = configuration.GetConnectionString("AzureStorage")
            ?? configuration["AZURE_STORAGE_CONNECTION_STRING"]
            ?? "UseDevelopmentStorage=true";
        var containerName = configuration["AZURE_STORAGE_BLOB_CONTAINER"] ?? "documents";

        services.AddSingleton(_ => new BlobServiceClient(storageConn));
        services.AddSingleton<IBlobStorageService>(sp =>
            new AzureBlobStorageService(sp.GetRequiredService<BlobServiceClient>(), containerName));

        services.AddSingleton(_ => new QueueClient(storageConn, DocumentQueueName));
        services.AddSingleton<IDocumentQueueService, AzureDocumentQueueService>();

        var useMockAi = bool.TryParse(configuration["DOCUMENT_INTELLIGENCE_USE_MOCK"], out var mockFlag) && mockFlag;
        var aiEndpoint = configuration["AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT"];
        var aiKey = configuration["AZURE_DOCUMENT_INTELLIGENCE_KEY"];

        if (!useMockAi && !string.IsNullOrWhiteSpace(aiEndpoint) && !string.IsNullOrWhiteSpace(aiKey))
        {
            services.AddSingleton<IDocumentIntelligenceService>(_ =>
                new AzureDocumentIntelligenceService(aiEndpoint, aiKey));
        }
        else
        {
            services.AddSingleton<IDocumentIntelligenceService, MockDocumentIntelligenceService>();
        }

        return services;
    }
}
