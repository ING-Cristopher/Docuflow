using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using DocuFlow.Application.Abstractions;
using DocuFlow.Domain.Documents;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace DocuFlow.Infrastructure.AI;

/// <summary>
/// Multimodal IDocumentIntelligenceService backed by Google Gemini API.
/// Extracts real fields directly from uploaded PDF or image streams.
/// </summary>
public sealed class GeminiDocumentIntelligenceService : IDocumentIntelligenceService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly HttpClient _httpClient;
    private readonly GeminiAgentOptions _options;
    private readonly ILogger<GeminiDocumentIntelligenceService> _logger;

    public GeminiDocumentIntelligenceService(
        HttpClient httpClient,
        IOptions<GeminiAgentOptions> options,
        ILogger<GeminiDocumentIntelligenceService> logger)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<DocumentAnalysisResult> AnalyzeAsync(
        Stream content,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            throw new InvalidOperationException("Gemini API key is not configured for document extraction.");
        }

        using var ms = new MemoryStream();
        if (content.CanSeek)
        {
            content.Position = 0;
        }
        await content.CopyToAsync(ms, cancellationToken);
        var base64Data = Convert.ToBase64String(ms.ToArray());

        var mimeType = string.IsNullOrWhiteSpace(contentType) ? "application/pdf" : contentType;

        var prompt = """
            Analiza el documento adjunto en su totalidad y extrae únicamente información real, relevante y útil que aparezca en él (ya sea un contrato, informe, factura, certificado, currículum, carta u otro documento).
            No inventes ni asumas valores que no estén presentes. No fuerces campos financieros si el documento no trata de finanzas.
            Devuelve un JSON válido con exactamente esta estructura:
            {
              "documentType": "Invoice | PurchaseOrder | Contract | Receipt | Other",
              "overallConfidence": 0.90,
              "summary": "Resumen completo y claro en español (entre 3 y 5 oraciones) que explique de qué trata el documento, su propósito principal, las partes o entidades involucradas y los puntos o conclusiones más importantes que contiene.",
              "fields": [
                {
                  "fieldName": "NombreDescriptivoDelDatoEnEspañol",
                  "rawValue": "valor exacto encontrado en el documento",
                  "normalizedValue": "valor limpio o normalizado",
                  "confidence": 0.95,
                  "pageNumber": 1,
                  "isFinanciallySensitive": false
                }
              ]
            }
            Incluye siempre "summary" con una síntesis precisa del contenido real, y entre 4 y 10 datos clave en "fields" (por ejemplo: TemaPrincipal, EmisorOEntidad, DestinatarioOParte, FechaDocumento, PuntosClave, Conclusiones, Referencia, o montos/fechas límite solo si existen en el documento).
            """;

        var payload = new
        {
            contents = new[]
            {
                new
                {
                    role = "user",
                    parts = new object[]
                    {
                        new { text = prompt },
                        new
                        {
                            inlineData = new
                            {
                                mimeType,
                                data = base64Data
                            }
                        }
                    }
                }
            },
            generationConfig = new
            {
                temperature = 0.1,
                maxOutputTokens = 2048,
                responseMimeType = "application/json"
            }
        };

        var candidateModels = new[] { _options.Model }
            .Concat(_options.FallbackModels ?? [])
            .Where(m => !string.IsNullOrWhiteSpace(m))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        HttpResponseMessage? response = null;
        string usedModel = _options.Model;
        System.Net.HttpStatusCode lastStatus = System.Net.HttpStatusCode.ServiceUnavailable;

        foreach (var model in candidateModels)
        {
            var endpoint = $"models/{model}:generateContent";
            using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = JsonContent.Create(payload, options: JsonOptions)
            };
            request.Headers.Add("x-goog-api-key", _options.ApiKey);

            var attemptResponse = await _httpClient.SendAsync(request, cancellationToken);
            if (attemptResponse.IsSuccessStatusCode)
            {
                response = attemptResponse;
                usedModel = model;
                break;
            }

            lastStatus = attemptResponse.StatusCode;
            var code = (int)attemptResponse.StatusCode;
            _logger.LogWarning("Gemini extraction returned HTTP {StatusCode} for model {Model}.", code, model);
            attemptResponse.Dispose();

            if (code is not (404 or 429 or 503))
            {
                throw new HttpRequestException($"Gemini extraction failed with HTTP {code} on model {model}.");
            }
        }

        if (response is null)
        {
            throw new HttpRequestException($"Gemini extraction failed across all configured models (last HTTP {(int)lastStatus}).");
        }

        using var finalResponse = response;
        var geminiResp = await finalResponse.Content.ReadFromJsonAsync<GeminiResponse>(JsonOptions, cancellationToken);
        var jsonText = geminiResp?.Candidates?.FirstOrDefault()?.Content?.Parts?.FirstOrDefault(p => !string.IsNullOrWhiteSpace(p.Text))?.Text;

        if (string.IsNullOrWhiteSpace(jsonText))
        {
            throw new InvalidOperationException("Gemini returned an empty extraction payload.");
        }

        var parsed = JsonSerializer.Deserialize<GeminiExtractionPayload>(jsonText, JsonOptions)
            ?? throw new InvalidOperationException("Failed to deserialize Gemini extraction JSON.");

        var detectedType = Enum.TryParse<DocumentType>(parsed.DocumentType, ignoreCase: true, out var dt)
            ? dt
            : DocumentType.Other;

        var fields = (parsed.Fields ?? [])
            .Where(f => !string.IsNullOrWhiteSpace(f.FieldName))
            .Select(f => new ExtractedFieldCandidate(
                f.FieldName.Trim(),
                Truncate(f.RawValue, 2000),
                Truncate(f.NormalizedValue ?? f.RawValue?.Trim(), 2000),
                Math.Clamp(f.Confidence ?? 0.70m, 0m, 1m),
                f.PageNumber ?? 1,
                null,
                f.IsFinanciallySensitive))
            .ToList();

        EnsureSummaryField(parsed.Summary, fields);

        var overallConfidence = parsed.OverallConfidence.HasValue
            ? Math.Clamp(parsed.OverallConfidence.Value, 0m, 1m)
            : (fields.Count > 0 ? Math.Clamp(fields.Average(f => f.Confidence), 0m, 1m) : 0.50m);

        var rawJson = JsonSerializer.Serialize(new
        {
            Provider = "GeminiMultimodal",
            ModelId = usedModel,
            ContentType = mimeType,
            Fields = fields.Count
        });

        return new DocumentAnalysisResult(
            "GeminiMultimodal",
            usedModel,
            detectedType,
            overallConfidence,
            rawJson,
            fields);
    }

    private static void EnsureSummaryField(string? summary, List<ExtractedFieldCandidate> fields)
    {
        var existingIndex = fields.FindIndex(f =>
            string.Equals(f.FieldName, "ResumenDelDocumento", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(f.FieldName, "ResumenEjecutivo", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(f.FieldName, "Resumen", StringComparison.OrdinalIgnoreCase));

        var trimmedSummary = Truncate(summary?.Trim(), 2000);

        if (existingIndex >= 0)
        {
            var existing = fields[existingIndex];
            var text = !string.IsNullOrWhiteSpace(trimmedSummary)
                ? trimmedSummary
                : existing.NormalizedValue ?? existing.RawValue;
            fields.RemoveAt(existingIndex);
            if (!string.IsNullOrWhiteSpace(text))
            {
                fields.Insert(0, existing with
                {
                    FieldName = "ResumenDelDocumento",
                    RawValue = text,
                    NormalizedValue = text
                });
            }
            return;
        }

        if (!string.IsNullOrWhiteSpace(trimmedSummary))
        {
            fields.Insert(0, new ExtractedFieldCandidate(
                "ResumenDelDocumento",
                trimmedSummary,
                trimmedSummary,
                0.92m,
                1,
                null,
                false));
        }
    }

    private static string? Truncate(string? value, int maxLength)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= maxLength)
            return value;
        return $"{value[..(maxLength - 1)]}…";
    }

    private sealed class GeminiResponse
    {
        public List<GeminiCandidate>? Candidates { get; init; }
    }

    private sealed class GeminiCandidate
    {
        public GeminiContent? Content { get; init; }
    }

    private sealed class GeminiContent
    {
        public List<GeminiPart>? Parts { get; init; }
    }

    private sealed class GeminiPart
    {
        public string? Text { get; init; }
    }

    private sealed class GeminiExtractionPayload
    {
        public string? DocumentType { get; init; }
        public decimal? OverallConfidence { get; init; }
        public string? Summary { get; init; }
        public List<GeminiFieldDto>? Fields { get; init; }
    }

    private sealed class GeminiFieldDto
    {
        public string FieldName { get; init; } = string.Empty;
        public string? RawValue { get; init; }
        public string? NormalizedValue { get; init; }
        public decimal? Confidence { get; init; }
        public int? PageNumber { get; init; }
        public bool IsFinanciallySensitive { get; init; }
    }
}
