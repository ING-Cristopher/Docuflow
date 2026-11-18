using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace DocuFlow.Infrastructure.Messaging;

/// <summary>
/// Persistence model for the PostgreSQL-backed processing queue.
/// System-level table (not exposed through IApplicationDbContext); only the queue service reads/writes it.
/// </summary>
public sealed class DocumentQueueMessage
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public string PayloadJson { get; set; } = string.Empty;
    public DateTimeOffset EnqueuedAt { get; set; }
    public DateTimeOffset VisibleAt { get; set; }
    public int DequeueCount { get; set; }
    public Guid? PopReceipt { get; set; }
}

public sealed class DocumentQueueMessageConfiguration : IEntityTypeConfiguration<DocumentQueueMessage>
{
    public void Configure(EntityTypeBuilder<DocumentQueueMessage> builder)
    {
        builder.ToTable("DocumentQueueMessages");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.PayloadJson).IsRequired();
        builder.HasIndex(x => new { x.VisibleAt, x.EnqueuedAt });
    }
}
