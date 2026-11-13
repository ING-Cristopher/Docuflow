using DocuFlow.Domain.Common;
using DocuFlow.Domain.Documents;
using DocuFlow.Domain.Extraction;

namespace DocuFlow.UnitTests.Domain;

public sealed class DocumentDomainTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid ReviewerId = Guid.NewGuid();

    [Fact]
    public void Document_FullHappyPath_TransitionsCorrectly()
    {
        var doc = new Document(OrgId, UserId, "Invoice #1001", DocumentType.Invoice);
        var version = doc.AddVersion("inv.pdf", "application/pdf", 1024, "abc123", "documents", "org/inv.pdf", UserId);

        Assert.Equal(1, doc.CurrentVersionNumber);
        Assert.Equal(version.Id, doc.LatestVersionId);
        Assert.Equal(DocumentStatus.Uploaded, doc.Status);

        doc.MarkQueued();
        Assert.Equal(DocumentStatus.Queued, doc.Status);

        doc.StartProcessing();
        Assert.Equal(DocumentStatus.Processing, doc.Status);

        doc.MarkExtracted(DocumentType.Invoice, requiresHumanReview: true);
        Assert.Equal(DocumentStatus.PendingReview, doc.Status);

        doc.Approve(ReviewerId, "Verified total and vendor.");
        Assert.Equal(DocumentStatus.Approved, doc.Status);
        Assert.Equal(ReviewerId, doc.ReviewedByUserId);
        Assert.NotNull(doc.ReviewedAt);
    }

    [Fact]
    public void Document_CannotQueueWithoutVersion()
    {
        var doc = new Document(OrgId, UserId, "Empty Doc");
        var ex = Assert.Throws<DomainException>(() => doc.MarkQueued());
        Assert.Equal("Document.NoVersion", ex.Code);
    }

    [Fact]
    public void Document_CannotApproveDirectlyFromUploadedOrProcessing()
    {
        var doc = new Document(OrgId, UserId, "Invoice #1002");
        doc.AddVersion("inv.pdf", "application/pdf", 512, "hash", "documents", "org/inv.pdf", UserId);

        Assert.Throws<DomainException>(() => doc.Approve(ReviewerId));

        doc.MarkQueued();
        doc.StartProcessing();
        Assert.Throws<DomainException>(() => doc.Approve(ReviewerId));
    }

    [Fact]
    public void Document_RejectRequiresReason()
    {
        var doc = new Document(OrgId, UserId, "Contract #1");
        doc.AddVersion("c.pdf", "application/pdf", 512, "hash", "documents", "org/c.pdf", UserId);
        doc.MarkQueued();
        doc.StartProcessing();
        doc.MarkExtracted(DocumentType.Contract, requiresHumanReview: true);

        Assert.Throws<DomainException>(() => doc.Reject(ReviewerId, "   "));
    }

    [Fact]
    public void Document_RetriesUntilMaxRetriesThenFails()
    {
        var doc = new Document(OrgId, UserId, "Bad Scan");
        doc.AddVersion("scan.png", "image/png", 2048, "hash", "documents", "org/scan.png", UserId);
        doc.MarkQueued();

        doc.StartProcessing();
        doc.RecordFailure("Transient timeout 1", canRetry: true);
        Assert.Equal(DocumentStatus.Queued, doc.Status);
        Assert.Equal(1, doc.RetryCount);

        doc.StartProcessing();
        doc.RecordFailure("Transient timeout 2", canRetry: true);
        Assert.Equal(DocumentStatus.Queued, doc.Status);
        Assert.Equal(2, doc.RetryCount);

        doc.StartProcessing();
        doc.RecordFailure("Transient timeout 3", canRetry: true);
        Assert.Equal(DocumentStatus.Failed, doc.Status);
        Assert.Equal(3, doc.RetryCount);
    }

    [Theory]
    [InlineData(-0.01)]
    [InlineData(1.01)]
    public void ConfidenceScore_OutOfRange_ThrowsDomainException(decimal value)
    {
        Assert.Throws<DomainException>(() => new ConfidenceScore(value));
    }

    [Fact]
    public void ExtractedField_FinanciallySensitiveOrLowConfidence_RequiresHumanReview()
    {
        var sensitive = new ExtractedField(
            OrgId, Guid.NewGuid(), Guid.NewGuid(),
            "TotalAmount", "1500.00", "1500.00",
            new ConfidenceScore(0.99m), 1, null, isFinanciallySensitive: true);

        Assert.True(sensitive.RequiresReview);
        Assert.False(sensitive.IsValidated);

        sensitive.ApplyManualCorrection("1500.00", ReviewerId);
        Assert.False(sensitive.RequiresReview);
        Assert.True(sensitive.IsValidated);
        Assert.Equal(ReviewerId, sensitive.CorrectedByUserId);

        var lowConf = new ExtractedField(
            OrgId, Guid.NewGuid(), Guid.NewGuid(),
            "VendorName", "Acne Corp", "Acne Corp",
            new ConfidenceScore(0.70m), 1, null, isFinanciallySensitive: false);

        Assert.True(lowConf.RequiresReview);
        Assert.False(lowConf.IsValidated);
    }
}

