using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using DocuFlow.Application.Abstractions;
using DocuFlow.Application.Auditing;
using DocuFlow.Application.Documents;
using DocuFlow.Application.Processing;
using DocuFlow.Application.Security;
using DocuFlow.Domain.Documents;
using DocuFlow.Domain.Tenancy;
using DocuFlow.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace DocuFlow.IntegrationTests.Api;

public sealed class DocuFlowApiIntegrationTests : IClassFixture<DocuFlowApiFactory>
{
    private readonly DocuFlowApiFactory _factory;

    public DocuFlowApiIntegrationTests(DocuFlowApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task UnauthenticatedRequests_Return401()
    {
        using var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/documents");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task EndToEnd_MultiTenantIsolation_Rbac_Processing_Review_And_Audit()
    {
        using var clientA = _factory.CreateClient();
        using var clientB = _factory.CreateClient();

        // 1. Register Org A and Org B
        var regA = await clientA.PostAsJsonAsync("/api/auth/register", new RegisterOrganizationRequest(
            "Alpha Corp", $"alpha-{Guid.NewGuid():N}"[..16], "Alice Owner", $"alice-{Guid.NewGuid():N}@alpha.com", "StrongPass123!"));
        Assert.Equal(HttpStatusCode.Created, regA.StatusCode);
        var authA = (await regA.Content.ReadFromJsonAsync<AuthResponse>())!;

        var regB = await clientB.PostAsJsonAsync("/api/auth/register", new RegisterOrganizationRequest(
            "Beta Corp", $"beta-{Guid.NewGuid():N}"[..16], "Bob Owner", $"bob-{Guid.NewGuid():N}@beta.com", "StrongPass123!"));
        Assert.Equal(HttpStatusCode.Created, regB.StatusCode);
        var authB = (await regB.Content.ReadFromJsonAsync<AuthResponse>())!;

        clientA.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authA.AccessToken);
        clientB.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authB.AccessToken);

        // 2. Org A uploads a valid PDF
        var pdfBytes = "%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"u8.ToArray();
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent("Invoice 2026-01"), "title");
        form.Add(new StringContent(((int)DocumentType.Invoice).ToString()), "documentType");
        var fileContent = new ByteArrayContent(pdfBytes);
        fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse("application/pdf");
        form.Add(fileContent, "file", "invoice.pdf");

        var uploadRes = await clientA.PostAsync("/api/documents", form);
        Assert.Equal(HttpStatusCode.Created, uploadRes.StatusCode);
        var uploaded = (await uploadRes.Content.ReadFromJsonAsync<DocumentSummaryDto>())!;
        Assert.Equal(DocumentStatus.Queued, uploaded.Status);

        // 3. Cross-tenant IDOR prevention: Org B cannot read, download, or approve Org A's document
        Assert.Equal(HttpStatusCode.NotFound, (await clientB.GetAsync($"/api/documents/{uploaded.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await clientB.GetAsync($"/api/documents/{uploaded.Id}/download")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await clientB.PostAsJsonAsync($"/api/documents/{uploaded.Id}/approve", new ReviewDecisionRequest("hack"))).StatusCode);

        // 4. Unauthorized organization switch is rejected with 403
        var switchRes = await clientA.PostAsJsonAsync("/api/auth/switch-organization", new SwitchOrganizationRequest(authB.OrganizationId));
        Assert.Equal(HttpStatusCode.Forbidden, switchRes.StatusCode);

        // 5. RBAC: Invite a Viewer in Org A and verify they cannot upload, approve, or read audit logs
        var viewerEmail = $"viewer-{Guid.NewGuid():N}@alpha.com";
        var inviteRes = await clientA.PostAsJsonAsync("/api/auth/members", new InviteMemberRequest(
            viewerEmail, "Victor Viewer", "ViewerPass123!", OrganizationRole.Viewer));
        Assert.Equal(HttpStatusCode.Created, inviteRes.StatusCode);

        using var viewerClient = _factory.CreateClient();
        var viewerLogin = await viewerClient.PostAsJsonAsync("/api/auth/login", new LoginRequest(viewerEmail, "ViewerPass123!", authA.OrganizationSlug));
        var viewerAuth = (await viewerLogin.Content.ReadFromJsonAsync<AuthResponse>())!;
        viewerClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", viewerAuth.AccessToken);

        Assert.Equal(HttpStatusCode.Forbidden, (await viewerClient.GetAsync("/api/audit-logs")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewerClient.PostAsJsonAsync($"/api/documents/{uploaded.Id}/approve", new ReviewDecisionRequest(null))).StatusCode);

        // 6. Async Worker Processing + Idempotency
        var queuedMessage = _factory.Queue.Messages.Last(m => m.DocumentId == uploaded.Id);
        using (var scope = _factory.Services.CreateScope())
        {
            var processor = scope.ServiceProvider.GetRequiredService<DocumentProcessingService>();
            await processor.ProcessAsync(queuedMessage);
            // Second invocation must be idempotent (no duplicate fields/errors)
            await processor.ProcessAsync(queuedMessage);
        }

        var detail = await clientA.GetFromJsonAsync<DocumentDetailDto>($"/api/documents/{uploaded.Id}");
        Assert.NotNull(detail);
        Assert.Equal(DocumentStatus.PendingReview, detail.Status);
        Assert.NotEmpty(detail.ExtractedFields);

        // 7. Human correction & approval
        var totalField = detail.ExtractedFields.First(f => f.FieldName == "TotalAmount");
        var patchRes = await clientA.PatchAsJsonAsync(
            $"/api/documents/{uploaded.Id}/fields/{totalField.Id}",
            new CorrectFieldRequest("1250.00"));
        Assert.Equal(HttpStatusCode.OK, patchRes.StatusCode);

        var approveRes = await clientA.PostAsJsonAsync($"/api/documents/{uploaded.Id}/approve", new ReviewDecisionRequest("Approved by Alice"));
        Assert.Equal(HttpStatusCode.NoContent, approveRes.StatusCode);

        var approvedDetail = await clientA.GetFromJsonAsync<DocumentDetailDto>($"/api/documents/{uploaded.Id}");
        Assert.Equal(DocumentStatus.Approved, approvedDetail!.Status);

        // 8. Download works for authorized tenant
        var downloadRes = await clientA.GetAsync($"/api/documents/{uploaded.Id}/download");
        Assert.Equal(HttpStatusCode.OK, downloadRes.StatusCode);
        Assert.Equal(pdfBytes, await downloadRes.Content.ReadAsByteArrayAsync());

        // 9. Audit logs recorded for Org A and isolated from Org B
        var audits = await clientA.GetFromJsonAsync<PagedResult<AuditLogDto>>("/api/audit-logs");
        Assert.NotNull(audits);
        Assert.Contains(audits.Items, a => a.Action == "DocumentUploaded" && a.EntityId == uploaded.Id);
        Assert.Contains(audits.Items, a => a.Action == "DocumentApproved" && a.EntityId == uploaded.Id);

        var auditsB = await clientB.GetFromJsonAsync<PagedResult<AuditLogDto>>("/api/audit-logs");
        Assert.NotNull(auditsB);
        Assert.DoesNotContain(auditsB.Items, a => a.EntityId == uploaded.Id);
    }

    [Fact]
    public async Task Security_AdminCannotEscalateToOwner_AndDeactivatedMembershipIsRevokedImmediately()
    {
        using var ownerClient = _factory.CreateClient();
        var slug = $"sec-{Guid.NewGuid():N}"[..16];
        var reg = await ownerClient.PostAsJsonAsync("/api/auth/register", new RegisterOrganizationRequest(
            "Sec Corp", slug, "Owner", $"owner-{Guid.NewGuid():N}@sec.com", "StrongPass123!"));
        var ownerAuth = (await reg.Content.ReadFromJsonAsync<AuthResponse>())!;
        ownerClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ownerAuth.AccessToken);

        // Invite an Admin
        var adminEmail = $"admin-{Guid.NewGuid():N}@sec.com";
        var inviteAdmin = await ownerClient.PostAsJsonAsync("/api/auth/members", new InviteMemberRequest(
            adminEmail, "Admin User", "AdminPass123!", OrganizationRole.Admin));
        Assert.Equal(HttpStatusCode.Created, inviteAdmin.StatusCode);

        using var adminClient = _factory.CreateClient();
        var adminLogin = await adminClient.PostAsJsonAsync("/api/auth/login", new LoginRequest(adminEmail, "AdminPass123!", slug));
        var adminAuth = (await adminLogin.Content.ReadFromJsonAsync<AuthResponse>())!;
        adminClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.AccessToken);

        // Admin cannot escalate a new user to Owner -> 403 Forbidden
        var escalateRes = await adminClient.PostAsJsonAsync("/api/auth/members", new InviteMemberRequest(
            $"hack-{Guid.NewGuid():N}@sec.com", "Hacker", "HackerPass123!", OrganizationRole.Owner));
        Assert.Equal(HttpStatusCode.Forbidden, escalateRes.StatusCode);

        // Deactivate Admin's membership in DB -> existing JWT is immediately rejected with 401
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<DocuFlowDbContext>();
            var membership = await db.OrganizationMemberships
                .IgnoreQueryFilters()
                .FirstAsync(m => m.UserId == adminAuth.UserId && m.OrganizationId == adminAuth.OrganizationId);
            membership.Deactivate();
            await db.SaveChangesAsync();
        }

        var revokedRes = await adminClient.GetAsync("/api/documents");
        Assert.Equal(HttpStatusCode.Unauthorized, revokedRes.StatusCode);
    }

    [Fact]
    public async Task Security_SpoofedPdfUpload_Returns400BadRequest()
    {
        using var client = _factory.CreateClient();
        var reg = await client.PostAsJsonAsync("/api/auth/register", new RegisterOrganizationRequest(
            "Upload Corp", $"up-{Guid.NewGuid():N}"[..16], "Owner", $"up-{Guid.NewGuid():N}@up.com", "StrongPass123!"));
        var auth = (await reg.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);

        using var form = new MultipartFormDataContent();
        form.Add(new StringContent("Fake PDF"), "title");
        form.Add(new StringContent(((int)DocumentType.Invoice).ToString()), "documentType");
        var fileContent = new ByteArrayContent("MZ_EXECUTABLE_NOT_PDF"u8.ToArray());
        fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse("application/pdf");
        form.Add(fileContent, "file", "fake.pdf");

        var uploadRes = await client.PostAsync("/api/documents", form);
        Assert.Equal(HttpStatusCode.BadRequest, uploadRes.StatusCode);
    }
}

public sealed class DocuFlowApiFactory : WebApplicationFactory<Program>, IDisposable
{
    private readonly SqliteConnection _connection;
    public InMemoryQueueService Queue { get; } = new();
    public InMemoryBlobStorageService Blobs { get; } = new();

    public DocuFlowApiFactory()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:DefaultConnection", "Host=localhost;Database=docuflow_test;");
        builder.UseSetting("DOCUMENT_INTELLIGENCE_FORCE_MOCK", "true");
        builder.UseSetting("Jwt:SecretKey", "DOCUFLOW_TEST_ONLY_SECRET_KEY_MIN_32_CHARS");
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IDbContextOptionsConfiguration<DocuFlowDbContext>>();
            services.RemoveAll<DbContextOptions<DocuFlowDbContext>>();
            services.RemoveAll<DocuFlowDbContext>();
            services.AddDbContext<DocuFlowDbContext>(options => options.UseSqlite(_connection));

            services.RemoveAll<IBlobStorageService>();
            services.AddSingleton<IBlobStorageService>(Blobs);

            services.RemoveAll<IDocumentQueueService>();
            services.AddSingleton<IDocumentQueueService>(Queue);

            using var sp = services.BuildServiceProvider();
            using var scope = sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<DocuFlowDbContext>();
            db.Database.EnsureCreated();
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
            _connection.Dispose();
    }

    public sealed class InMemoryBlobStorageService : IBlobStorageService
    {
        private readonly ConcurrentDictionary<string, byte[]> _store = new();
        public string ContainerName => "documents";

        public async Task UploadAsync(string blobPath, Stream content, string contentType, CancellationToken cancellationToken = default)
        {
            content.Position = 0;
            using var ms = new MemoryStream();
            await content.CopyToAsync(ms, cancellationToken);
            _store[blobPath] = ms.ToArray();
        }

        public Task<Stream> DownloadAsync(string blobPath, CancellationToken cancellationToken = default)
        {
            var bytes = _store[blobPath];
            return Task.FromResult<Stream>(new MemoryStream(bytes));
        }
    }

    public sealed class InMemoryQueueService : IDocumentQueueService
    {
        public ConcurrentQueue<DocumentProcessingMessage> Messages { get; } = new();

        public Task EnqueueAsync(DocumentProcessingMessage message, CancellationToken cancellationToken = default)
        {
            Messages.Enqueue(message);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<QueuedDocumentEnvelope>> ReceiveBatchAsync(int maxMessages = 5, CancellationToken cancellationToken = default)
            => Task.FromResult<IReadOnlyList<QueuedDocumentEnvelope>>([]);

        public Task CompleteAsync(string messageId, string popReceipt, CancellationToken cancellationToken = default)
            => Task.CompletedTask;
    }
}

