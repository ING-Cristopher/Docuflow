using System.Text.Json;
using DocuFlow.Application.Abstractions;
using DocuFlow.Domain.Documents;
using Microsoft.EntityFrameworkCore;

namespace DocuFlow.Application.AI;

/// <summary>
/// Local C# tool exposed to Gemini Function Calling to inspect tenant-scoped document metrics.
/// </summary>
public sealed class DocumentSummaryAgentTool : IAgentTool
{
    private readonly IApplicationDbContext _dbContext;
    private readonly ITenantContext _tenantContext;

    public DocumentSummaryAgentTool(IApplicationDbContext dbContext, ITenantContext tenantContext)
    {
        _dbContext = dbContext;
        _tenantContext = tenantContext;
    }

    public string Name => "get_organization_document_summary";

    public string Description =>
        "Obtiene el resumen de documentos de la organización activa: total de documentos, conteo por estado y los últimos 5 documentos.";

    public object ParametersSchema => new
    {
        type = "OBJECT",
        properties = new
        {
            statusFilter = new
            {
                type = "STRING",
                description = "Filtro opcional de estado (PendingReview, Approved, Rejected, Processing, Failed)."
            }
        }
    };

    public async Task<object> ExecuteAsync(JsonElement arguments, CancellationToken cancellationToken = default)
    {
        if (_tenantContext.OrganizationId is null)
        {
            return new { error = "No active organization context." };
        }

        DocumentStatus? parsedStatus = null;
        if (arguments.ValueKind == JsonValueKind.Object &&
            arguments.TryGetProperty("statusFilter", out var statusElement) &&
            statusElement.ValueKind == JsonValueKind.String &&
            Enum.TryParse<DocumentStatus>(statusElement.GetString(), ignoreCase: true, out var statusValue))
        {
            parsedStatus = statusValue;
        }

        var query = _dbContext.Documents.AsNoTracking();
        if (parsedStatus.HasValue)
        {
            query = query.Where(d => d.Status == parsedStatus.Value);
        }

        var total = await query.CountAsync(cancellationToken);
        var pendingReview = await _dbContext.Documents.AsNoTracking()
            .CountAsync(d => d.Status == DocumentStatus.PendingReview, cancellationToken);
        var approved = await _dbContext.Documents.AsNoTracking()
            .CountAsync(d => d.Status == DocumentStatus.Approved, cancellationToken);
        var failed = await _dbContext.Documents.AsNoTracking()
            .CountAsync(d => d.Status == DocumentStatus.Failed, cancellationToken);

        var recent = await query
            .OrderByDescending(d => d.CreatedAt)
            .Take(5)
            .Select(d => new
            {
                d.Id,
                d.Title,
                DocumentType = d.DocumentType.ToString(),
                Status = d.Status.ToString(),
                d.CreatedAt
            })
            .ToListAsync(cancellationToken);

        return new
        {
            totalMatchingDocuments = total,
            pendingReviewCount = pendingReview,
            approvedCount = approved,
            failedCount = failed,
            recentDocuments = recent
        };
    }
}
