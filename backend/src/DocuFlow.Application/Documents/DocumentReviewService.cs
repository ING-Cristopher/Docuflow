using DocuFlow.Application.Abstractions;
using DocuFlow.Domain.Auditing;
using DocuFlow.Domain.Common;
using DocuFlow.Domain.Documents;
using DocuFlow.Domain.Extraction;
using Microsoft.EntityFrameworkCore;

namespace DocuFlow.Application.Documents;

public sealed class DocumentReviewService
{
    private readonly IApplicationDbContext _dbContext;
    private readonly ITenantContext _tenantContext;

    public DocumentReviewService(IApplicationDbContext dbContext, ITenantContext tenantContext)
    {
        _dbContext = dbContext;
        _tenantContext = tenantContext;
    }

    public async Task<ExtractedFieldDto> CorrectFieldAsync(
        Guid documentId,
        Guid fieldId,
        string correctedValue,
        CancellationToken cancellationToken = default)
    {
        var (orgId, userId) = RequireTenantUser();

        var field = await _dbContext.ExtractedFields
            .FirstOrDefaultAsync(f => f.Id == fieldId && f.DocumentId == documentId, cancellationToken)
            ?? throw new DomainException("ExtractedField.NotFound", "Extracted field not found.");

        field.ApplyManualCorrection(correctedValue, userId);

        var matchingIssues = await _dbContext.ValidationIssues
            .Where(v => v.DocumentId == documentId
                        && v.DocumentVersionId == field.DocumentVersionId
                        && v.FieldName == field.FieldName
                        && !v.IsResolved)
            .ToListAsync(cancellationToken);

        foreach (var issue in matchingIssues)
            issue.Resolve(userId);

        _dbContext.AuditLogs.Add(new AuditLog(
            orgId,
            userId,
            "ExtractedFieldCorrected",
            nameof(ExtractedField),
            field.Id,
            $"{{\"fieldName\":\"{field.FieldName}\"}}"));

        await _dbContext.SaveChangesAsync(cancellationToken);

        return new ExtractedFieldDto(
            field.Id, field.FieldName, field.RawValue, field.NormalizedValue,
            field.Confidence, field.PageNumber, field.BoundingBoxJson,
            field.IsFinanciallySensitive, field.RequiresReview,
            field.CorrectedValue, field.IsValidated);
    }

    public async Task ApproveAsync(Guid documentId, string? notes, CancellationToken cancellationToken = default)
    {
        var (orgId, userId) = RequireTenantUser();

        var doc = await _dbContext.Documents
            .FirstOrDefaultAsync(d => d.Id == documentId, cancellationToken)
            ?? throw new DomainException("Document.NotFound", "Document not found.");

        var hasUnresolvedErrors = await _dbContext.ValidationIssues
            .AnyAsync(v => v.DocumentId == doc.Id
                           && v.DocumentVersionId == doc.LatestVersionId
                           && !v.IsResolved
                           && v.Severity == ValidationSeverity.Error,
                cancellationToken);

        if (hasUnresolvedErrors)
            throw new DomainException("Document.UnresolvedValidationErrors", "Cannot approve document with unresolved validation errors.");

        var unreviewedFields = await _dbContext.ExtractedFields
            .Where(f => f.DocumentId == doc.Id
                        && f.DocumentVersionId == doc.LatestVersionId
                        && f.RequiresReview)
            .ToListAsync(cancellationToken);

        // Explicit human approval validates remaining pending fields under reviewer accountability.
        foreach (var field in unreviewedFields)
            field.MarkValidated();

        doc.Approve(userId, notes);
        _dbContext.AuditLogs.Add(new AuditLog(orgId, userId, "DocumentApproved", nameof(Document), doc.Id));
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task RejectAsync(Guid documentId, string reason, CancellationToken cancellationToken = default)
    {
        var (orgId, userId) = RequireTenantUser();

        var doc = await _dbContext.Documents
            .FirstOrDefaultAsync(d => d.Id == documentId, cancellationToken)
            ?? throw new DomainException("Document.NotFound", "Document not found.");

        doc.Reject(userId, reason);
        _dbContext.AuditLogs.Add(new AuditLog(orgId, userId, "DocumentRejected", nameof(Document), doc.Id));
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    private (Guid OrganizationId, Guid UserId) RequireTenantUser()
    {
        if (!_tenantContext.HasOrganizationContext || _tenantContext.UserId is null)
            throw new DomainException("Auth.MissingTenantContext", "Authenticated organization context is required.");
        return (_tenantContext.OrganizationId!.Value, _tenantContext.UserId.Value);
    }
}

