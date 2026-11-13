using DocuFlow.Application.Abstractions;
using DocuFlow.Domain.Tenancy;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DocuFlow.Infrastructure.Persistence;

public sealed class DbInitializer
{
    private readonly DocuFlowDbContext _dbContext;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ILogger<DbInitializer> _logger;

    public DbInitializer(
        DocuFlowDbContext dbContext,
        IPasswordHasher passwordHasher,
        ILogger<DbInitializer> logger)
    {
        _dbContext = dbContext;
        _passwordHasher = passwordHasher;
        _logger = logger;
    }

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        if (await _dbContext.Organizations.IgnoreQueryFilters().AnyAsync(cancellationToken))
            return;

        var demoOrg = new Organization("DocuFlow Demo Organization", "docuflow-demo");
        var adminUser = new User(
            "admin@docuflow.local",
            "DocuFlow Admin",
            _passwordHasher.Hash("DocuFlow_Admin_123!"));
        var reviewerUser = new User(
            "reviewer@docuflow.local",
            "DocuFlow Reviewer",
            _passwordHasher.Hash("DocuFlow_Reviewer_123!"));

        var adminMembership = new OrganizationMembership(demoOrg.Id, adminUser.Id, OrganizationRole.Owner);
        var reviewerMembership = new OrganizationMembership(demoOrg.Id, reviewerUser.Id, OrganizationRole.Reviewer);

        _dbContext.Organizations.Add(demoOrg);
        _dbContext.Users.AddRange(adminUser, reviewerUser);
        _dbContext.OrganizationMemberships.AddRange(adminMembership, reviewerMembership);

        await _dbContext.SaveChangesAsync(cancellationToken);
        _logger.LogInformation("Seeded initial demo organization {OrganizationSlug} and users.", demoOrg.Slug);
    }
}

