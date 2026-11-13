using DocuFlow.Domain.Common;

namespace DocuFlow.Domain.Documents;

public sealed class Document : Entity, ITenantEntity
{
    public const int DefaultMaxRetries = 3;

    public Guid OrganizationId { get; private set; }
    public Guid UploadedByUserId { get; private set; }
    public string Title { get; private set; } = string.Empty;
    public DocumentType DocumentType { get; private set; } = DocumentType.Unknown;
    public DocumentStatus Status { get; private set; } = DocumentStatus.Uploaded;
    public int CurrentVersionNumber { get; private set; }
    public Guid? LatestVersionId { get; private set; }
    public int RetryCount { get; private set; }
    public int MaxRetries { get; private set; } = DefaultMaxRetries;
    public string? LastError { get; private set; }
    public Guid? ReviewedByUserId { get; private set; }
    public DateTimeOffset? ReviewedAt { get; private set; }
    public string? ReviewNotes { get; private set; }
    public byte[] RowVersion { get; private set; } = [];

    private readonly List<DocumentVersion> _versions = [];
    public IReadOnlyCollection<DocumentVersion> Versions => _versions.AsReadOnly();

    private Document() { }

    public Document(Guid organizationId, Guid uploadedByUserId, string title, DocumentType documentType = DocumentType.Unknown)
    {
        if (organizationId == Guid.Empty)
            throw new DomainException("Document.InvalidOrganization", "OrganizationId is required.");
        if (uploadedByUserId == Guid.Empty)
            throw new DomainException("Document.InvalidUser", "UploadedByUserId is required.");
        if (string.IsNullOrWhiteSpace(title))
            throw new DomainException("Document.InvalidTitle", "Document title is required.");

        OrganizationId = organizationId;
        UploadedByUserId = uploadedByUserId;
        Title = title.Trim();
        DocumentType = documentType;
        Status = DocumentStatus.Uploaded;
    }

    public DocumentVersion AddVersion(
        string originalFileName,
        string contentType,
        long sizeBytes,
        string sha256Hash,
        string blobContainer,
        string blobPath,
        Guid uploadedByUserId)
    {
        var nextVersion = CurrentVersionNumber + 1;
        var version = new DocumentVersion(
            OrganizationId,
            Id,
            nextVersion,
            originalFileName,
            contentType,
            sizeBytes,
            sha256Hash,
            blobContainer,
            blobPath,
            uploadedByUserId);

        _versions.Add(version);
        CurrentVersionNumber = nextVersion;
        LatestVersionId = version.Id;
        Touch();
        return version;
    }

    public void MarkQueued()
    {
        if (Status is not (DocumentStatus.Uploaded or DocumentStatus.Failed))
            throw new DomainException("Document.InvalidTransition", $"Cannot queue document from status {Status}.");

        if (LatestVersionId is null)
            throw new DomainException("Document.NoVersion", "Cannot queue a document without an uploaded version.");

        Status = DocumentStatus.Queued;
        LastError = null;
        Touch();
    }

    public void StartProcessing()
    {
        if (Status != DocumentStatus.Queued)
            throw new DomainException("Document.InvalidTransition", $"Cannot start processing from status {Status}.");

        Status = DocumentStatus.Processing;
        Touch();
    }

    public void MarkExtracted(DocumentType detectedType, bool requiresHumanReview)
    {
        if (Status != DocumentStatus.Processing)
            throw new DomainException("Document.InvalidTransition", $"Cannot mark extracted from status {Status}.");

        if (detectedType != DocumentType.Unknown)
            DocumentType = detectedType;

        Status = requiresHumanReview ? DocumentStatus.PendingReview : DocumentStatus.Extracted;
        LastError = null;
        Touch();
    }

    public void RequireReview(string? reason = null)
    {
        if (Status is not (DocumentStatus.Extracted or DocumentStatus.PendingReview))
            throw new DomainException("Document.InvalidTransition", $"Cannot require review from status {Status}.");

        Status = DocumentStatus.PendingReview;
        if (!string.IsNullOrWhiteSpace(reason))
            ReviewNotes = reason.Trim();
        Touch();
    }

    public void Approve(Guid reviewerUserId, string? notes = null)
    {
        if (reviewerUserId == Guid.Empty)
            throw new DomainException("Document.InvalidReviewer", "ReviewerUserId is required.");
        if (Status is not (DocumentStatus.Extracted or DocumentStatus.PendingReview))
            throw new DomainException("Document.InvalidTransition", $"Cannot approve document from status {Status}.");

        Status = DocumentStatus.Approved;
        ReviewedByUserId = reviewerUserId;
        ReviewedAt = DateTimeOffset.UtcNow;
        ReviewNotes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        Touch();
    }

    public void Reject(Guid reviewerUserId, string reason)
    {
        if (reviewerUserId == Guid.Empty)
            throw new DomainException("Document.InvalidReviewer", "ReviewerUserId is required.");
        if (string.IsNullOrWhiteSpace(reason))
            throw new DomainException("Document.InvalidRejectionReason", "Rejection reason is required.");
        if (Status is not (DocumentStatus.Extracted or DocumentStatus.PendingReview))
            throw new DomainException("Document.InvalidTransition", $"Cannot reject document from status {Status}.");

        Status = DocumentStatus.Rejected;
        ReviewedByUserId = reviewerUserId;
        ReviewedAt = DateTimeOffset.UtcNow;
        ReviewNotes = reason.Trim();
        Touch();
    }

    public void RecordFailure(string error, bool canRetry = true)
    {
        if (Status is not (DocumentStatus.Queued or DocumentStatus.Processing))
            throw new DomainException("Document.InvalidTransition", $"Cannot record failure from status {Status}.");

        LastError = string.IsNullOrWhiteSpace(error) ? "Unknown processing error." : error.Trim();
        RetryCount++;

        if (canRetry && RetryCount < MaxRetries)
        {
            Status = DocumentStatus.Queued;
        }
        else
        {
            Status = DocumentStatus.Failed;
        }

        Touch();
    }
}

