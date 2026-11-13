using DocuFlow.Application.Abstractions;
using DocuFlow.Domain.Auditing;
using DocuFlow.Domain.Common;
using DocuFlow.Domain.Documents;
using DocuFlow.Domain.Extraction;
using DocuFlow.Domain.Tenancy;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace DocuFlow.Infrastructure.Persistence;

public sealed class DocuFlowDbContext : DbContext, IApplicationDbContext
{
    private readonly ITenantContext _tenantContext;

    public DocuFlowDbContext(DbContextOptions<DocuFlowDbContext> options, ITenantContext? tenantContext = null)
        : base(options)
    {
        _tenantContext = tenantContext ?? EmptyTenantContext.Instance;
    }

    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<User> Users => Set<User>();
    public DbSet<OrganizationMembership> OrganizationMemberships => Set<OrganizationMembership>();
    public DbSet<Document> Documents => Set<Document>();
    public DbSet<DocumentVersion> DocumentVersions => Set<DocumentVersion>();
    public DbSet<ExtractedField> ExtractedFields => Set<ExtractedField>();
    public DbSet<ExtractionRun> ExtractionRuns => Set<ExtractionRun>();
    public DbSet<ValidationIssue> ValidationIssues => Set<ValidationIssue>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(DocuFlowDbContext).Assembly);

        // Fail-closed multi-tenant global query filters:
        // When no organization context is active, tenant-scoped queries return zero rows
        // unless IgnoreQueryFilters() is explicitly invoked by trusted system services.
        modelBuilder.Entity<Document>()
            .HasQueryFilter(e => _tenantContext.OrganizationId != null && e.OrganizationId == _tenantContext.OrganizationId);

        modelBuilder.Entity<DocumentVersion>()
            .HasQueryFilter(e => _tenantContext.OrganizationId != null && e.OrganizationId == _tenantContext.OrganizationId);

        modelBuilder.Entity<ExtractedField>()
            .HasQueryFilter(e => _tenantContext.OrganizationId != null && e.OrganizationId == _tenantContext.OrganizationId);

        modelBuilder.Entity<ExtractionRun>()
            .HasQueryFilter(e => _tenantContext.OrganizationId != null && e.OrganizationId == _tenantContext.OrganizationId);

        modelBuilder.Entity<ValidationIssue>()
            .HasQueryFilter(e => _tenantContext.OrganizationId != null && e.OrganizationId == _tenantContext.OrganizationId);

        modelBuilder.Entity<AuditLog>()
            .HasQueryFilter(e => _tenantContext.OrganizationId != null && e.OrganizationId == _tenantContext.OrganizationId);

        modelBuilder.Entity<OutboxMessage>()
            .HasQueryFilter(e => _tenantContext.OrganizationId != null && e.OrganizationId == _tenantContext.OrganizationId);

        modelBuilder.Entity<OrganizationMembership>()
            .HasQueryFilter(e => _tenantContext.OrganizationId == null || e.OrganizationId == _tenantContext.OrganizationId);

        if (Database.ProviderName == "Microsoft.EntityFrameworkCore.Sqlite")
        {
            modelBuilder.Entity<Document>().Property(x => x.RowVersion).ValueGeneratedNever().IsConcurrencyToken();
            modelBuilder.Entity<ExtractedField>().Property(x => x.RowVersion).ValueGeneratedNever().IsConcurrencyToken();

            foreach (var entityType in modelBuilder.Model.GetEntityTypes())
            {
                var dateTimeOffsetProps = entityType.ClrType.GetProperties()
                    .Where(p => p.PropertyType == typeof(DateTimeOffset) || p.PropertyType == typeof(DateTimeOffset?));
                foreach (var prop in dateTimeOffsetProps)
                {
                    modelBuilder.Entity(entityType.Name).Property(prop.Name)
                        .HasConversion(new DateTimeOffsetToBinaryConverter());
                }
            }
        }
    }

    private sealed class EmptyTenantContext : ITenantContext
    {
        public static readonly EmptyTenantContext Instance = new();
        public Guid? OrganizationId => null;
        public Guid? UserId => null;
        public OrganizationRole? Role => null;
    }
}

