using DocuFlow.Application.Abstractions;
using DocuFlow.Infrastructure.AI;
using DocuFlow.Infrastructure.Messaging;
using DocuFlow.Infrastructure.Persistence;
using DocuFlow.Infrastructure.Security;
using DocuFlow.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http.Resilience;
using Polly;

namespace DocuFlow.Infrastructure;

public static class DependencyInjection
{
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

        var storageRoot = configuration["DOCUMENT_STORAGE_PATH"] is { Length: > 0 } configuredPath
            ? configuredPath
            : Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData, Environment.SpecialFolderOption.Create),
                "DocuFlow",
                "storage");
        var containerName = configuration["DOCUMENT_STORAGE_CONTAINER"] ?? "documents";

        services.AddSingleton<IBlobStorageService>(_ => new LocalFileStorageService(storageRoot, containerName));

        var queueVisibilitySeconds = int.TryParse(configuration["DOCUMENT_QUEUE_VISIBILITY_SECONDS"], out var vis) && vis > 0
            ? vis
            : 300;
        services.AddSingleton<IDocumentQueueService>(_ =>
            new PostgresDocumentQueueService(connectionString, TimeSpan.FromSeconds(queueVisibilitySeconds)));

        var forceMockAi = bool.TryParse(configuration["DOCUMENT_INTELLIGENCE_FORCE_MOCK"], out var forceMockFlag) && forceMockFlag;
        var geminiApiKey = configuration[$"{GeminiAgentOptions.SectionName}:ApiKey"] ?? configuration["GEMINI_API_KEY"];

        services.Configure<GeminiAgentOptions>(options =>
        {
            var section = configuration.GetSection(GeminiAgentOptions.SectionName);
            section.Bind(options);
            if (string.IsNullOrWhiteSpace(options.ApiKey))
            {
                options.ApiKey = configuration["GEMINI_API_KEY"] ?? string.Empty;
            }
        });

        services.AddHttpClient<GeminiDocumentIntelligenceService>(client =>
            {
                var baseUrl = configuration[$"{GeminiAgentOptions.SectionName}:BaseUrl"]
                    ?? "https://generativelanguage.googleapis.com/v1beta/";
                client.BaseAddress = new Uri(baseUrl.EndsWith('/') ? baseUrl : $"{baseUrl}/");
                client.Timeout = TimeSpan.FromMinutes(3);
            })
            .AddStandardResilienceHandler(options =>
            {
                options.Retry.MaxRetryAttempts = 1;
                options.Retry.Delay = TimeSpan.FromSeconds(1);
                options.Retry.BackoffType = DelayBackoffType.Exponential;
                options.AttemptTimeout.Timeout = TimeSpan.FromSeconds(90);
                options.CircuitBreaker.SamplingDuration = TimeSpan.FromSeconds(180);
                options.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(170);
            });

        if (!forceMockAi && !string.IsNullOrWhiteSpace(geminiApiKey))
        {
            services.AddTransient<IDocumentIntelligenceService>(sp =>
                sp.GetRequiredService<GeminiDocumentIntelligenceService>());
        }
        else
        {
            services.AddSingleton<IDocumentIntelligenceService, MockDocumentIntelligenceService>();
        }

        // Second-stage LLM analysis. Opt-in: sends extracted field values to a third party (Google).
        var aiEnabled = bool.TryParse(configuration["AI_ANALYSIS_ENABLED"], out var aiFlag) && aiFlag;
        var aiMock = bool.TryParse(configuration["AI_ANALYSIS_USE_MOCK"], out var aiMockFlag) && aiMockFlag;
        var geminiKey = configuration["GEMINI_API_KEY"];

        if (aiEnabled && aiMock)
        {
            services.AddSingleton<IDocumentAiAnalyzer, MockDocumentAiAnalyzer>();
        }
        else if (aiEnabled && !string.IsNullOrWhiteSpace(geminiKey))
        {
            var geminiOptions = new GeminiOptions
            {
                ApiKey = geminiKey,
                Model = configuration["GEMINI_MODEL"] is { Length: > 0 } m ? m : "gemini-2.5-flash",
                TimeoutSeconds = int.TryParse(configuration["GEMINI_TIMEOUT_SECONDS"], out var to) && to > 0 ? to : 30
            };
            services.AddSingleton<IDocumentAiAnalyzer>(sp => new GeminiDocumentAnalyzer(
                new HttpClient { Timeout = TimeSpan.FromSeconds(geminiOptions.TimeoutSeconds) },
                geminiOptions,
                sp.GetRequiredService<Microsoft.Extensions.Logging.ILogger<GeminiDocumentAnalyzer>>()));
        }
        else
        {
            services.AddSingleton<IDocumentAiAnalyzer, DisabledDocumentAiAnalyzer>();
        }

        services.AddHttpClient<IDocumentAgentService, GeminiAgentService>(client =>
            {
                var baseUrl = configuration[$"{GeminiAgentOptions.SectionName}:BaseUrl"]
                    ?? "https://generativelanguage.googleapis.com/v1beta/";
                client.BaseAddress = new Uri(baseUrl.EndsWith('/') ? baseUrl : $"{baseUrl}/");
                client.Timeout = TimeSpan.FromSeconds(120);
            })
            .AddStandardResilienceHandler(options =>
            {
                options.Retry.MaxRetryAttempts = 1;
                options.Retry.Delay = TimeSpan.FromSeconds(1);
                options.Retry.BackoffType = DelayBackoffType.Exponential;
                options.AttemptTimeout.Timeout = TimeSpan.FromSeconds(45);
                options.CircuitBreaker.SamplingDuration = TimeSpan.FromSeconds(90);
                options.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(110);
            });

        return services;
    }
}
