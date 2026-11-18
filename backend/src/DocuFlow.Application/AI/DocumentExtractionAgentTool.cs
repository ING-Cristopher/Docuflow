using System.Text.Json;
using DocuFlow.Application.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace DocuFlow.Application.AI;

/// <summary>
/// Local C# tool exposed to Gemini Function Calling to retrieve extracted fields,
/// confidence scores, and validation issues for a specific tenant-scoped document.
/// </summary>
public sealed class DocumentExtractionAgentTool : IAgentTool
{
    private readonly IApplicationDbContext _dbContext;
    private readonly ITenantContext _tenantContext;

    public DocumentExtractionAgentTool(IApplicationDbContext dbContext, ITenantContext tenantContext)
    {
        _dbContext = dbContext;
        _tenantContext = tenantContext;
    }

    public string Name => "get_document_extracted_data";

    public string Description =>
        "Obtiene los datos extraídos, niveles de confianza, alertas de validación y metadatos de un documento específico de la organización activa (por documentId o título).";

    public object ParametersSchema => new
    {
        type = "OBJECT",
        properties = new
        {
            documentId = new
            {
                type = "STRING",
                description = "UUID del documento a consultar."
            },
            titleQuery = new
            {
                type = "STRING",
                description = "Texto parcial del título del documento si no se conoce el UUID."
            }
        }
    };

    public async Task<object> ExecuteAsync(JsonElement arguments, CancellationToken cancellationToken = default)
    {
        if (_tenantContext.OrganizationId is null)
        {
            return new { error = "No active organization context." };
        }

        Guid? documentId = null;
        string? titleQuery = null;

        if (arguments.ValueKind == JsonValueKind.Object)
        {
            if (arguments.TryGetProperty("documentId", out var idEl) &&
                idEl.ValueKind == JsonValueKind.String &&
                Guid.TryParse(idEl.GetString(), out var parsedId))
            {
                documentId = parsedId;
            }

            if (arguments.TryGetProperty("titleQuery", out var titleEl) &&
                titleEl.ValueKind == JsonValueKind.String)
            {
                titleQuery = titleEl.GetString()?.Trim();
            }
        }

        var query = _dbContext.Documents.AsNoTracking();

        if (documentId.HasValue)
        {
            query = query.Where(d => d.Id == documentId.Value);
        }
        else if (!string.IsNullOrWhiteSpace(titleQuery))
        {
            query = query.Where(d => EF.Functions.Like(d.Title, $"%{titleQuery}%"));
        }
        else
        {
            return new { error = "Se requiere documentId o titleQuery para consultar el documento." };
        }

        var doc = await query
            .OrderByDescending(d => d.CreatedAt)
            .Select(d => new
            {
                d.Id,
                d.Title,
                DocumentType = d.DocumentType.ToString(),
                Status = d.Status.ToString(),
                d.CurrentVersionNumber,
                d.CreatedAt,
                d.LastError
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (doc is null)
        {
            return new { found = false, message = "Documento no encontrado en la organización activa." };
        }

        var fields = await _dbContext.ExtractedFields.AsNoTracking()
            .Where(f => f.DocumentId == doc.Id)
            .OrderBy(f => f.FieldName)
            .Select(f => new
            {
                f.FieldName,
                f.RawValue,
                f.NormalizedValue,
                f.CorrectedValue,
                f.Confidence,
                f.PageNumber,
                f.IsFinanciallySensitive,
                f.RequiresReview,
                f.IsValidated
            })
            .ToListAsync(cancellationToken);

        var issues = await _dbContext.ValidationIssues.AsNoTracking()
            .Where(v => v.DocumentId == doc.Id)
            .Select(v => new
            {
                v.RuleCode,
                v.FieldName,
                Severity = v.Severity.ToString(),
                v.Message,
                v.IsResolved
            })
            .ToListAsync(cancellationToken);

        return new
        {
            found = true,
            document = doc,
            extractedFields = fields,
            validationIssues = issues
        };
    }
}
