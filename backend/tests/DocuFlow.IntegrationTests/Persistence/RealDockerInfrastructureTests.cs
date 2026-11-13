using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Queues;
using DocuFlow.Application.Abstractions;
using DocuFlow.Domain.Documents;
using DocuFlow.Domain.Tenancy;
using DocuFlow.Infrastructure.Messaging;
using DocuFlow.Infrastructure.Persistence;
using DocuFlow.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;

namespace DocuFlow.IntegrationTests.Persistence;

public sealed class RealDockerInfrastructureTests
{
    private const string SqlConn =
        "Server=127.0.0.1,1433;Database=DocuFlowDb;User Id=sa;Password=DocuFlow_Dev_Pass123!;TrustServerCertificate=True;MultipleActiveResultSets=true;";
    private const string AzuriteConn =
        "UseDevelopmentStorage=true;DevelopmentStorageProxyUri=http://127.0.0.1;";

    private static bool ShouldRunDockerTests =>
        string.Equals(Environment.GetEnvironmentVariable("DOCUFLOW_RUN_DOCKER_TESTS"), "true", StringComparison.OrdinalIgnoreCase);

    [Fact]
    public async Task RealSqlServer_And_Azurite_EndToEndSmokeTest()
    {
        if (!ShouldRunDockerTests)
            return;

        // 1. Real SQL Server 2022 connectivity + RowVersion generation
        var options = new DbContextOptionsBuilder<DocuFlowDbContext>()
            .UseSqlServer(SqlConn)
            .Options;

        var org = new Organization("Docker Audit Org", $"audit-{Guid.NewGuid():N}"[..16]);
        var user = new User($"audit-{Guid.NewGuid():N}@test.local", "Audit User", "hash");
        var doc = new Document(org.Id, user.Id, "Real SQL Server Doc", DocumentType.Invoice);

        await using (var db = new DocuFlowDbContext(options))
        {
            Assert.True(await db.Database.CanConnectAsync());
            db.Organizations.Add(org);
            db.Users.Add(user);
            db.Documents.Add(doc);
            await db.SaveChangesAsync();

            Assert.NotEmpty(doc.RowVersion);
        }

        // 2. Real Azurite Blob Storage (private container)
        var blobServiceClient = new BlobServiceClient(AzuriteConn);
        var blobService = new AzureBlobStorageService(blobServiceClient, "documents-audit-test");
        var payloadBytes = "%PDF-1.4\n%RealAzuriteTest\n"u8.ToArray();
        var blobPath = $"{org.Id}/{doc.Id}/v1/test.pdf";

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
        var msg = new DocumentProcessingMessage(org.Id, doc.Id, Guid.NewGuid());
        await queueService.EnqueueAsync(msg);

        var batch = await queueService.ReceiveBatchAsync(maxMessages: 1);
        Assert.Single(batch);
        Assert.Equal(doc.Id, batch[0].Payload!.DocumentId);
        await queueService.CompleteAsync(batch[0].MessageId, batch[0].PopReceipt);
        await queueClient.DeleteIfExistsAsync();
    }
}

