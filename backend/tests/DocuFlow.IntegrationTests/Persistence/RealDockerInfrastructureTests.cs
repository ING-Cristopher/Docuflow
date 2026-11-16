using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Queues;
using DocuFlow.Application.Abstractions;
using DocuFlow.Domain.Auditing;
using DocuFlow.Domain.Documents;
using DocuFlow.Domain.Tenancy;
using DocuFlow.Infrastructure.Messaging;
using DocuFlow.Infrastructure.Persistence;
using DocuFlow.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;

namespace DocuFlow.IntegrationTests.Persistence;

public sealed class RealDockerInfrastructureTests
{
    private static string PostgresConn =>
        Environment.GetEnvironmentVariable("POSTGRES_CONNECTION_STRING")
        ?? "Host=127.0.0.1;Port=5432;Database=docuflow;Username=docuflow;Password=postgres";

    private const string AzuriteConn =
        "UseDevelopmentStorage=true;DevelopmentStorageProxyUri=http://127.0.0.1;";

    private static bool ShouldRunDockerTests =>
        string.Equals(Environment.GetEnvironmentVariable("DOCUFLOW_RUN_DOCKER_TESTS"), "true", StringComparison.OrdinalIgnoreCase);

    [Fact]
    public async Task RealPostgreSql_And_Azurite_EndToEndSmokeTest()
    {
        if (!ShouldRunDockerTests)
            return;

        // 1. Real PostgreSQL 17 connectivity, migrations, transactions, tenant isolation & xmin concurrency
        var options = new DbContextOptionsBuilder<DocuFlowDbContext>()
            .UseNpgsql(PostgresConn)
            .Options;

        var orgA = new Organization("Docker Audit Org A", $"audit-a-{Guid.NewGuid():N}"[..16]);
        var orgB = new Organization("Docker Audit Org B", $"audit-b-{Guid.NewGuid():N}"[..16]);
        var user = new User($"audit-{Guid.NewGuid():N}@test.local", "Audit User", "hash");
        var membershipA = new OrganizationMembership(orgA.Id, user.Id, OrganizationRole.Owner);
        var doc = new Document(orgA.Id, user.Id, "Real PostgreSQL Doc", DocumentType.Invoice);
        doc.AddVersion("test.pdf", "application/pdf", 128, new string('a', 64), "documents", $"{orgA.Id}/{doc.Id}/v1/test.pdf", user.Id);
        var audit = new AuditLog(orgA.Id, user.Id, "DocumentUploaded", "Document", doc.Id, "{\"source\":\"docker-test\"}");

        await using (var db = new DocuFlowDbContext(options))
        {
            Assert.True(await db.Database.CanConnectAsync());
            await db.Database.MigrateAsync();

            await using var tx = await db.Database.BeginTransactionAsync();
            db.Organizations.AddRange(orgA, orgB);
            db.Users.Add(user);
            db.OrganizationMemberships.Add(membershipA);
            db.Documents.Add(doc);
            db.AuditLogs.Add(audit);
            await db.SaveChangesAsync();
            await tx.CommitAsync();
        }

        // Verify optimistic concurrency via PostgreSQL xmin system column
        await using (var db1 = new DocuFlowDbContext(options, new StaticTenantContext(orgA.Id, user.Id, OrganizationRole.Owner)))
        await using (var db2 = new DocuFlowDbContext(options, new StaticTenantContext(orgA.Id, user.Id, OrganizationRole.Owner)))
        {
            var doc1 = await db1.Documents.SingleAsync(d => d.Id == doc.Id);
            var doc2 = await db2.Documents.SingleAsync(d => d.Id == doc.Id);

            doc1.MarkQueued();
            await db1.SaveChangesAsync();

            doc2.MarkQueued();
            await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => db2.SaveChangesAsync());
        }

        // Verify strict multi-tenant isolation on PostgreSQL
        await using (var dbOrgB = new DocuFlowDbContext(options, new StaticTenantContext(orgB.Id, user.Id, OrganizationRole.Owner)))
        {
            Assert.Empty(await dbOrgB.Documents.Where(d => d.Id == doc.Id).ToListAsync());
            Assert.Empty(await dbOrgB.AuditLogs.Where(a => a.Id == audit.Id).ToListAsync());
        }

        // 2. Real Azurite Blob Storage (private container)
        var blobServiceClient = new BlobServiceClient(AzuriteConn);
        var blobService = new AzureBlobStorageService(blobServiceClient, "documents-audit-test");
        var payloadBytes = "%PDF-1.4\n%RealAzuriteTest\n"u8.ToArray();
        var blobPath = $"{orgA.Id}/{doc.Id}/v1/test.pdf";

        await using (var uploadStream = new MemoryStream(payloadBytes))
        {
            await blobService.UploadAsync(blobPath, uploadStream, "application/pdf");
        }

        var containerProps = await blobServiceClient.GetBlobContainerClient("documents-audit-test").GetPropertiesAsync();
        Assert.Equal(PublicAccessType.None, containerProps.Value.PublicAccess);

        await using (var downloaded = await blobService.DownloadAsync(blobPath))
        using (var ms = new MemoryStream())
        {
            await downloaded.CopyToAsync(ms);
            Assert.Equal(payloadBytes, ms.ToArray());
        }

        // 3. Real Azurite Queue Storage (enqueue, receive, delete)
        var queueClient = new QueueClient(AzuriteConn, $"docuflow-audit-{Guid.NewGuid():N}"[..24]);
        var queueService = new AzureDocumentQueueService(queueClient);
        var msg = new DocumentProcessingMessage(orgA.Id, doc.Id, Guid.NewGuid());
        await queueService.EnqueueAsync(msg);

        var batch = await queueService.ReceiveBatchAsync(maxMessages: 1);
        Assert.Single(batch);
        Assert.Equal(doc.Id, batch[0].Payload!.DocumentId);
        await queueService.CompleteAsync(batch[0].MessageId, batch[0].PopReceipt);
        await queueClient.DeleteIfExistsAsync();
    }

    private sealed class StaticTenantContext(Guid organizationId, Guid userId, OrganizationRole role) : ITenantContext
    {
        public Guid? OrganizationId => organizationId;
        public Guid? UserId => userId;
        public OrganizationRole? Role => role;
    }
}
