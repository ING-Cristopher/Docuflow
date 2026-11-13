using DocuFlow.Domain.Tenancy;

namespace DocuFlow.Application.Abstractions;

public interface IJwtTokenGenerator
{
    string GenerateToken(User user, Organization organization, OrganizationRole role);
}

