using DocuFlow.Domain.Tenancy;
using DocuFlow.Infrastructure.Security;
using Microsoft.Extensions.Options;

namespace DocuFlow.IntegrationTests.Security;

public sealed class AuthAndPasswordHasherTests
{
    [Fact]
    public void Pbkdf2PasswordHasher_HashesAndVerifiesCorrectly()
    {
        var hasher = new Pbkdf2PasswordHasher();
        var hash1 = hasher.Hash("StrongPass123!");
        var hash2 = hasher.Hash("StrongPass123!");

        Assert.NotEqual(hash1, hash2);
        Assert.True(hasher.Verify("StrongPass123!", hash1));
        Assert.False(hasher.Verify("WrongPass123!", hash1));
    }

    [Fact]
    public void JwtTokenGenerator_GeneratesValidJwtWithTenantClaims()
    {
        var options = Options.Create(new JwtOptions
        {
            SecretKey = "TEST_SECRET_KEY_AT_LEAST_32_CHARS_LONG_1234",
            Issuer = "DocuFlow.Test",
            Audience = "DocuFlow.Client",
            ExpirationMinutes = 30
        });

        var generator = new JwtTokenGenerator(options);
        var user = new User("admin@acme.com", "Acme Admin", "hash");
        var org = new Organization("Acme Corp", "acme");

        var token = generator.GenerateToken(user, org, OrganizationRole.Admin);

        Assert.False(string.IsNullOrWhiteSpace(token));
        Assert.Equal(3, token.Split('.').Length);
    }
}

