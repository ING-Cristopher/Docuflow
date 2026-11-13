using DocuFlow.Domain.Auditing;
using DocuFlow.Domain.Common;
using DocuFlow.Domain.Documents;
using DocuFlow.Domain.Extraction;
using DocuFlow.Domain.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace DocuFlow.Application.Abstractions;

public interface IApplicationDbContext
{
    DbSet<Organization> Organizations { get; }
    DbSet<User> Users { get; }
    DbSet<OrganizationMembership> OrganizationMemberships { get; }
    DbSet<Document> Documents { get; }
    DbSet<DocumentVersion> DocumentVersions { get; }
    DbSet<ExtractedField> ExtractedFields { get; }
    DbSet<ExtractionRun> ExtractionRuns { get; }
    DbSet<ValidationIssue> ValidationIssues { get; }
    DbSet<AuditLog> AuditLogs { get; }
    DbSet<OutboxMessage> OutboxMessages { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}

