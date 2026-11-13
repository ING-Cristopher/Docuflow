using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace DocuFlow.Infrastructure.Persistence;

public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<DocuFlowDbContext>
{
    public DocuFlowDbContext CreateDbContext(string[] args)
    {
        var optionsBuilder = new DbContextOptionsBuilder<DocuFlowDbContext>();
        var connectionString = Environment.GetEnvironmentVariable("SQL_CONNECTION_STRING")
            ?? "Server=localhost,1433;Database=DocuFlowDb;User Id=sa;Password=DocuFlow_Dev_Pass123!;TrustServerCertificate=True;";

        optionsBuilder.UseSqlServer(connectionString);
        return new DocuFlowDbContext(optionsBuilder.Options);
    }
}

