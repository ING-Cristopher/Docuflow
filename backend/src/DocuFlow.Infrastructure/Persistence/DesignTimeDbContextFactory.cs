using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace DocuFlow.Infrastructure.Persistence;

public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<DocuFlowDbContext>
{
    public DocuFlowDbContext CreateDbContext(string[] args)
    {
        var optionsBuilder = new DbContextOptionsBuilder<DocuFlowDbContext>();
        var connectionString = Environment.GetEnvironmentVariable("POSTGRES_CONNECTION_STRING")
            ?? "Host=localhost;Port=5432;Database=docuflow;Username=docuflow;Password=postgres";

        optionsBuilder.UseNpgsql(connectionString);
        return new DocuFlowDbContext(optionsBuilder.Options);
    }
}

