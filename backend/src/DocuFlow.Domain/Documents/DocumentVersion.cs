using DocuFlow.Domain.Common;

namespace DocuFlow.Domain.Documents;

public sealed class DocumentVersion : Entity, ITenantEntity
{
    public Guid OrganizationId { get; private set; }
    public Guid DocumentId { get; private set; }
    public int VersionNumber { get; private set; }
    public string OriginalFileName { get; private set; } = string.Empty;
    public string ContentType { get; private set; } = string.Empty;
    public long SizeBytes { get; private set; }
    public string Sha256Hash { get; private set; } = string.Empty;
    public string BlobContainer { get; private set; } = string.Empty;
    public string BlobPath { get; private set; } = string.Empty;
    public Guid UploadedByUserId { get; private set; }

    public Document? Document { get; private set; }

    private DocumentVersion() { }

    internal DocumentVersion(
        Guid organizationId,
        Guid documentId,
        int versionNumber,
        string originalFileName,
        string contentType,
        long sizeBytes,
        string sha256Hash,
        string blobContainer,
        string blobPath,
        Guid uploadedByUserId)
    {
        if (organizationId == Guid.Empty)
            throw new DomainException("DocumentVersion.InvalidOrganization", "OrganizationId is required.");
        if (documentId == Guid.Empty)
            throw new DomainException("DocumentVersion.InvalidDocument", "DocumentId is required.");
        if (versionNumber <= 0)
            throw new DomainException("DocumentVersion.InvalidVersion", "Version number must be positive.");
        if (string.IsNullOrWhiteSpace(originalFileName))
            throw new DomainException("DocumentVersion.InvalidFileName", "Original file name is required.");
        if (sizeBytes <= 0)
            throw new DomainException("DocumentVersion.InvalidSize", "File size must be greater than zero.");
        if (string.IsNullOrWhiteSpace(sha256Hash))
            throw new DomainException("DocumentVersion.InvalidHash", "SHA-256 hash is required.");
        if (string.IsNullOrWhiteSpace(blobPath) || string.IsNullOrWhiteSpace(blobContainer))
            throw new DomainException("DocumentVersion.InvalidBlobLocation", "Blob container and path are required.");
        if (uploadedByUserId == Guid.Empty)
            throw new DomainException("DocumentVersion.InvalidUser", "UploadedByUserId is required.");

        OrganizationId = organizationId;
        DocumentId = documentId;
        VersionNumber = versionNumber;
        OriginalFileName = originalFileName.Trim();
        ContentType = contentType.Trim();
        SizeBytes = sizeBytes;
        Sha256Hash = sha256Hash.Trim().ToLowerInvariant();
        BlobContainer = blobContainer.Trim();
        BlobPath = blobPath.Trim();
        UploadedByUserId = uploadedByUserId;
    }
}

