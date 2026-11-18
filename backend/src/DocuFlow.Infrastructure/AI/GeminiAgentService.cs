using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using DocuFlow.Application.Abstractions;
using DocuFlow.Domain.Common;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace DocuFlow.Infrastructure.AI;

public sealed class GeminiAgentService : IDocumentAgentService
{
    private const int MaxToolRounds = 3;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly HttpClient _httpClient;
    private readonly GeminiAgentOptions _options;
    private readonly Dictionary<string, IAgentTool> _tools;
    private readonly ITenantContext _tenantContext;
    private readonly ILogger<GeminiAgentService> _logger;

    public GeminiAgentService(
        HttpClient httpClient,
        IOptions<GeminiAgentOptions> options,
        IEnumerable<IAgentTool> tools,
        ITenantContext tenantContext,
        ILogger<GeminiAgentService> logger)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _tools = tools.ToDictionary(t => t.Name, StringComparer.OrdinalIgnoreCase);
        _tenantContext = tenantContext;
        _logger = logger;
    }

    public async Task<AgentChatResponse> ChatAsync(AgentChatRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var trimmedMessage = request.Message.Trim();
        if (string.IsNullOrWhiteSpace(trimmedMessage))
        {
            throw new DomainException("Agent.InvalidMessage", "El mensaje no puede estar vacío.");
        }

        if (trimmedMessage.Length > AgentChatRequest.MaxMessageLength)
        {
            throw new DomainException("Agent.MessageTooLong",
                $"El mensaje excede el límite máximo de {AgentChatRequest.MaxMessageLength} caracteres.");
        }

        if (request.DocumentContent is { Length: > AgentChatRequest.MaxDocumentContentLength })
        {
            throw new DomainException("Agent.DocumentContentTooLong",
                $"El contenido del documento excede el límite máximo de {AgentChatRequest.MaxDocumentContentLength} caracteres.");
        }

        if (request.History is { Count: > AgentChatRequest.MaxHistoryTurns })
        {
            throw new DomainException("Agent.HistoryTooLong",
                $"El historial no puede superar los {AgentChatRequest.MaxHistoryTurns} turnos.");
        }

        if (string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            _logger.LogError("Gemini API key is not configured for organization {OrganizationId}.", _tenantContext.OrganizationId);
            throw new DomainException("Agent.NotConfigured",
                "El servicio de asistente de IA no está configurado en este entorno.");
        }

        var contents = BuildInitialContents(request, trimmedMessage);
        var executedTools = new List<string>();

        var candidateModels = new[] { _options.Model }
            .Concat(_options.FallbackModels ?? [])
            .Where(m => !string.IsNullOrWhiteSpace(m))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        try
        {
            for (var round = 0; round < MaxToolRounds; round++)
            {
                var payload = BuildRequestPayload(contents);
                HttpResponseMessage? httpResponse = null;
                var usedModel = _options.Model;

                foreach (var model in candidateModels)
                {
                    var endpoint = $"models/{model}:generateContent";
                    using var httpRequest = new HttpRequestMessage(HttpMethod.Post, endpoint)
                    {
                        Content = JsonContent.Create(payload, options: JsonOptions)
                    };
                    // Pass API key in header rather than URL query string so it never appears in logs or traces.
                    httpRequest.Headers.Add("x-goog-api-key", _options.ApiKey);

                    var attemptResponse = await _httpClient.SendAsync(httpRequest, cancellationToken);
                    if (attemptResponse.IsSuccessStatusCode)
                    {
                        httpResponse = attemptResponse;
                        usedModel = model;
                        break;
                    }

                    var code = (int)attemptResponse.StatusCode;
                    _logger.LogWarning(
                        "Gemini API returned HTTP {StatusCode} on model {Model} for organization {OrganizationId}.",
                        code,
                        model,
                        _tenantContext.OrganizationId);
                    attemptResponse.Dispose();

                    if (code is not (404 or 429 or 503))
                    {
                        throw new DomainException("Agent.Unavailable",
                            "El asistente de IA no pudo procesar la solicitud en este momento.");
                    }
                }

                if (httpResponse is null)
                {
                    throw new DomainException("Agent.Unavailable",
                        "El asistente de IA no pudo procesar la solicitud en este momento.");
                }

                using var finalResponse = httpResponse;
                var geminiResponse = await finalResponse.Content.ReadFromJsonAsync<GeminiGenerateContentResponse>(
                    JsonOptions,
                    cancellationToken);

                var candidate = geminiResponse?.Candidates?.FirstOrDefault();
                var parts = candidate?.Content?.Parts;
                if (parts is null || parts.Count == 0)
                {
                    throw new DomainException("Agent.Unavailable",
                        "El asistente de IA no devolvió una respuesta válida.");
                }

                var functionCalls = parts
                    .Where(p => p.FunctionCall is not null)
                    .Select(p => p.FunctionCall!)
                    .ToList();

                if (functionCalls.Count == 0)
                {
                    var textReply = string.Join("\n", parts.Where(p => !string.IsNullOrWhiteSpace(p.Text)).Select(p => p.Text));
                    return new AgentChatResponse(
                        string.IsNullOrWhiteSpace(textReply) ? "No se generó contenido textual." : textReply.Trim(),
                        usedModel,
                        executedTools,
                        DateTimeOffset.UtcNow);
                }

                // Append model turn containing the functionCall(s)
                contents.Add(new GeminiContent
                {
                    Role = "model",
                    Parts = parts
                });

                // Execute local C# tools and append functionResponse turn
                var responseParts = new List<GeminiPart>();
                foreach (var call in functionCalls)
                {
                    object toolResult;
                    if (_tools.TryGetValue(call.Name, out var tool))
                    {
                        var args = call.Args ?? JsonDocument.Parse("{}").RootElement;
                        toolResult = await tool.ExecuteAsync(args, cancellationToken);
                        executedTools.Add(call.Name);
                    }
                    else
                    {
                        _logger.LogWarning("Gemini requested unknown tool {ToolName}.", call.Name);
                        toolResult = new { error = $"Tool '{call.Name}' is not registered." };
                    }

                    responseParts.Add(new GeminiPart
                    {
                        FunctionResponse = new GeminiFunctionResponse
                        {
                            Name = call.Name,
                            Response = toolResult
                        }
                    });
                }

                contents.Add(new GeminiContent
                {
                    Role = "user",
                    Parts = responseParts
                });
            }

            throw new DomainException("Agent.Unavailable",
                "El asistente superó el límite de llamadas a herramientas para esta consulta.");
        }
        catch (DomainException)
        {
            throw;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            // Never log _options.ApiKey or raw authorization headers.
            _logger.LogError(ex,
                "Unexpected error invoking Gemini API ({Model}) for organization {OrganizationId}.",
                _options.Model,
                _tenantContext.OrganizationId);

            throw new DomainException("Agent.Unavailable",
                "El asistente de IA no está disponible temporalmente. Intenta de nuevo en unos momentos.");
        }
    }

    private List<GeminiContent> BuildInitialContents(AgentChatRequest request, string trimmedMessage)
    {
        var contents = new List<GeminiContent>();

        if (request.History is not null)
        {
            foreach (var turn in request.History)
            {
                contents.Add(new GeminiContent
                {
                    Role = turn.Role,
                    Parts = [new GeminiPart { Text = turn.Content.Trim() }]
                });
            }
        }

        var userPrompt = request.DocumentId.HasValue
            ? $"[Contexto DocumentoId: {request.DocumentId.Value}] {trimmedMessage}"
            : trimmedMessage;

        if (!string.IsNullOrWhiteSpace(request.DocumentContent))
        {
            userPrompt = $"{userPrompt}\n\n[Contenido del documento compartido]:\n{request.DocumentContent.Trim()}";
        }

        contents.Add(new GeminiContent
        {
            Role = "user",
            Parts = [new GeminiPart { Text = userPrompt }]
        });

        return contents;
    }

    private object BuildRequestPayload(List<GeminiContent> contents)
    {
        var toolDeclarations = _tools.Values
            .Select(t => new
            {
                name = t.Name,
                description = t.Description,
                parameters = t.ParametersSchema
            })
            .ToArray();

        return new
        {
            systemInstruction = new
            {
                parts = new[]
                {
                    new
                    {
                        text = $"{_options.SystemInstruction} Organización activa: {_tenantContext.OrganizationId?.ToString() ?? "N/A"}."
                    }
                }
            },
            contents,
            tools = toolDeclarations.Length > 0
                ? new[] { new { functionDeclarations = toolDeclarations } }
                : null,
            generationConfig = new
            {
                temperature = _options.Temperature,
                maxOutputTokens = _options.MaxOutputTokens
            }
        };
    }

    private sealed class GeminiGenerateContentResponse
    {
        public List<GeminiCandidate>? Candidates { get; init; }
    }

    private sealed class GeminiCandidate
    {
        public GeminiContent? Content { get; init; }
    }

    private sealed class GeminiContent
    {
        public string Role { get; init; } = "user";
        public List<GeminiPart> Parts { get; init; } = [];
    }

    private sealed class GeminiPart
    {
        public string? Text { get; init; }
        public GeminiFunctionCall? FunctionCall { get; init; }
        public GeminiFunctionResponse? FunctionResponse { get; init; }
    }

    private sealed class GeminiFunctionCall
    {
        public string Name { get; init; } = string.Empty;
        public JsonElement? Args { get; init; }
    }

    private sealed class GeminiFunctionResponse
    {
        public string Name { get; init; } = string.Empty;
        public object Response { get; init; } = new { };
    }
}
