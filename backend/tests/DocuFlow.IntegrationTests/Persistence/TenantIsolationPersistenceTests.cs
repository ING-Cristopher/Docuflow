using DocuFlow.Application.Abstractions;
using DocuFlow.Domain.Documents;
using DocuFlow.Domain.Tenancy;
using DocuFlow.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace DocuFlow.IntegrationTests.Persistence;

public sealed class TenantIsolationPersistenceTests : IDisposable
{
    private readonly SqliteConnection _connection;

    public TenantIsolationPersistenceTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();
    }

    [Fact]
    public async Task GlobalQueryFilter_IsolatesDocumentsByOrganization_AndFailsClosedWithoutContext()
    {
        var orgA = new Organization("Org A", "org-a");
        var orgB = new Organization("Org B", "org-b");
        var userA = new User("a@org.com", "User A", "hash");
        var userB = new User("b@org.com", "User B", "hash");

        var options = new DbContextOptionsBuilder<DocuFlowDbContext>()
            .UseSqlite(_connection)
            .Options;

        await using (var setupDb = new DocuFlowDbContext(options))
        {
            await setupDb.Database.EnsureCreatedAsync();
            setupDb.Organizations.AddRange(orgA, orgB);
            setupDb.Users.AddRange(userA, userB);

            var docA = new Document(orgA.Id, userA.Id, "Org A Invoice", DocumentType.Invoice);
            var docB = new Document(orgB.Id, userB.Id, "Org B Contract", DocumentType.Contract);
            setupDb.Documents.AddRange(docA, docB);
            await setupDb.SaveChangesAsync();
        }

        // 1. Fail-closed when no tenant context is active
        await using (var noTenantDb = new DocuFlowDbContext(options, tenantContext: null))
        {
            var docs = await noTenantDb.Documents.ToListAsync();
            Assert.Empty(docs);
        }

        // 2. Org A only sees Org A documents
        await using (var orgADb = new DocuFlowDbContext(options, new TestTenantContext(orgA.Id, userA.Id, OrganizationRole.Admin)))
        {
            var docs = await orgADb.Documents.ToListAsync();
            Assert.Single(docs);
            Assert.Equal("Org A Invoice", docs[0].Title);
        }

        // 3. Org B only sees Org B documents
        await using (var orgBDb = new DocuFlowDbContext(options, new TestTenantContext(orgB.Id, userB.Id, OrganizationRole.Admin)))
        {
            var docs = await orgBDb.Documents.ToListAsync();
            Assert.Single(docs);
            Assert.Equal("Org B Contract", docs[0].Title);
        }
    }

    public void Dispose() => _connection.Dispose();

    private sealed class TestTenantContext(Guid orgId, Guid userId, OrganizationRole role) : ITenantContext
    {
        public Guid? OrganizationId => orgId;
        public Guid? UserId => userId;
        public OrganizationRole? Role => role;
    }
}

