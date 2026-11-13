using DocuFlow.Domain.Auditing;
using DocuFlow.Domain.Common;
using DocuFlow.Domain.Documents;
using DocuFlow.Domain.Extraction;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace DocuFlow.Infrastructure.Persistence.Configurations;

public sealed class ExtractedFieldConfiguration : IEntityTypeConfiguration<ExtractedField>
{
    public void Configure(EntityTypeBuilder<ExtractedField> builder)
    {
        builder.ToTable("ExtractedFields");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.FieldName).HasMaxLength(150).IsRequired();
        builder.Property(x => x.RawValue).HasMaxLength(2000);
        builder.Property(x => x.NormalizedValue).HasMaxLength(2000);
        builder.Property(x => x.CorrectedValue).HasMaxLength(2000);
        builder.Property(x => x.Confidence).HasPrecision(5, 4).IsRequired();
        builder.Property(x => x.RowVersion).IsRowVersion();

        builder.HasIndex(x => new { x.OrganizationId, x.DocumentId, x.DocumentVersionId });
        builder.HasOne<Document>().WithMany().HasForeignKey(x => x.DocumentId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<DocumentVersion>().WithMany().HasForeignKey(x => x.DocumentVersionId).OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class ExtractionRunConfiguration : IEntityTypeConfiguration<ExtractionRun>
{
    public void Configure(EntityTypeBuilder<ExtractionRun> builder)
    {
        builder.ToTable("ExtractionRuns");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.ProviderName).HasMaxLength(100).IsRequired();
        builder.Property(x => x.ModelId).HasMaxLength(150).IsRequired();
        builder.Property(x => x.OverallConfidence).HasPrecision(5, 4);
        builder.Property(x => x.ErrorMessage).HasMaxLength(2000);

        builder.HasIndex(x => new { x.OrganizationId, x.DocumentId, x.DocumentVersionId });
    }
}

public sealed class ValidationIssueConfiguration : IEntityTypeConfiguration<ValidationIssue>
{
    public void Configure(EntityTypeBuilder<ValidationIssue> builder)
    {
        builder.ToTable("ValidationIssues");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.RuleCode).HasMaxLength(100).IsRequired();
        builder.Property(x => x.FieldName).HasMaxLength(150);
        builder.Property(x => x.Message).HasMaxLength(1000).IsRequired();

        builder.HasIndex(x => new { x.OrganizationId, x.DocumentId, x.IsResolved });
    }
}

public sealed class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> builder)
    {
        builder.ToTable("AuditLogs");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Action).HasMaxLength(150).IsRequired();
        builder.Property(x => x.EntityType).HasMaxLength(100).IsRequired();
        builder.Property(x => x.IpAddress).HasMaxLength(64);

        builder.HasIndex(x => new { x.OrganizationId, x.OccurredAt });
        builder.HasIndex(x => new { x.OrganizationId, x.EntityType, x.EntityId });
    }
}

public sealed class OutboxMessageConfiguration : IEntityTypeConfiguration<OutboxMessage>
{
    public void Configure(EntityTypeBuilder<OutboxMessage> builder)
    {
        builder.ToTable("OutboxMessages");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.EventType).HasMaxLength(150).IsRequired();
        builder.Property(x => x.PayloadJson).IsRequired();
        builder.Property(x => x.LastError).HasMaxLength(2000);

        builder.HasIndex(x => new { x.ProcessedAt, x.OccurredAt });
    }
}

