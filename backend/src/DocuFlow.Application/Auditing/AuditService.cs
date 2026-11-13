using DocuFlow.Application.Abstractions;
using DocuFlow.Application.Documents;
using DocuFlow.Domain.Common;
using Microsoft.EntityFrameworkCore;

namespace DocuFlow.Application.Auditing;

public sealed record AuditLogDto(
    Guid Id,
    Guid? ActorUserId,
    string Action,
    string EntityType,
    Guid? EntityId,
    string? DetailsJson,
    DateTimeOffset OccurredAt);

public sealed class AuditService
{
    private readonly IApplicationDbContext _dbContext;
    private readonly ITenantContext _tenantContext;

    public AuditService(IApplicationDbContext dbContext, ITenantContext tenantContext)
    {
        _dbContext = dbContext;
        _tenantContext = tenantContext;
    }

    public async Task<PagedResult<AuditLogDto>> GetPagedAsync(
        int page = 1,
        int pageSize = 25,
        string? action = null,
        CancellationToken cancellationToken = default)
    {
        if (!_tenantContext.HasOrganizationContext)
            throw new DomainException("Auth.MissingTenantContext", "Authenticated organization context is required.");

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _dbContext.AuditLogs.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(action))
            query = query.Where(a => a.Action == action.Trim());

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(a => a.OccurredAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new AuditLogDto(
                a.Id, a.ActorUserId, a.Action, a.EntityType,
                a.EntityId, a.DetailsJson, a.OccurredAt))
            .ToListAsync(cancellationToken);

        return new PagedResult<AuditLogDto>(items, page, pageSize, total);
    }
}

