using DocuFlow.API.Security;
using DocuFlow.Application.Documents;
using DocuFlow.Domain.Documents;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DocuFlow.API.Controllers;

[ApiController]
[Route("api/documents")]
[Authorize]
public sealed class DocumentsController : ControllerBase
{
    private readonly DocumentService _documentService;
    private readonly DocumentReviewService _reviewService;

    public DocumentsController(DocumentService documentService, DocumentReviewService reviewService)
    {
        _documentService = documentService;
        _reviewService = reviewService;
    }

    [Authorize(Policy = PolicyNames.RequireOperator)]
    [HttpPost]
    [RequestSizeLimit(26_214_400)] // 25 MB + multipart overhead
    [ProducesResponseType(typeof(DocumentSummaryDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<DocumentSummaryDto>> Upload(
        [FromForm] string title,
        [FromForm] DocumentType documentType,
        IFormFile file,
        CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new ProblemDetails { Title = "File.Empty", Detail = "A non-empty file is required." });

        await using var rawStream = file.OpenReadStream();
        Stream uploadStream = rawStream;
        MemoryStream? bufferedFallback = null;
        if (!rawStream.CanSeek)
        {
            bufferedFallback = new MemoryStream();
            await rawStream.CopyToAsync(bufferedFallback, cancellationToken);
            bufferedFallback.Position = 0;
            uploadStream = bufferedFallback;
        }

        await using var _ = bufferedFallback;
        var result = await _documentService.UploadAsync(
            title,
            documentType,
            file.FileName,
            file.ContentType,
            file.Length,
            uploadStream,
            cancellationToken);

        return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
    }

    [Authorize(Policy = PolicyNames.RequireViewer)]
    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<DocumentSummaryDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<DocumentSummaryDto>>> GetPaged(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] DocumentStatus? status = null,
        [FromQuery] DocumentType? documentType = null,
        [FromQuery] string? search = null,
        CancellationToken cancellationToken = default)
    {
        var result = await _documentService.GetPagedAsync(page, pageSize, status, documentType, search, cancellationToken);
        return Ok(result);
    }

    [Authorize(Policy = PolicyNames.RequireViewer)]
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(DocumentDetailDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DocumentDetailDto>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var doc = await _documentService.GetByIdAsync(id, cancellationToken);
        return doc is null ? NotFound() : Ok(doc);
    }

    [Authorize(Policy = PolicyNames.RequireViewer)]
    [HttpGet("{id:guid}/download")]
    public async Task<IActionResult> Download(Guid id, CancellationToken cancellationToken)
    {
        var file = await _documentService.DownloadLatestAsync(id, cancellationToken);
        if (file is null)
            return NotFound();

        return File(file.Value.Content, file.Value.ContentType, file.Value.FileName);
    }

    [Authorize(Policy = PolicyNames.RequireReviewer)]
    [HttpPatch("{id:guid}/fields/{fieldId:guid}")]
    [ProducesResponseType(typeof(ExtractedFieldDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<ExtractedFieldDto>> CorrectField(
        Guid id,
        Guid fieldId,
        [FromBody] CorrectFieldRequest request,
        CancellationToken cancellationToken)
    {
        var updated = await _reviewService.CorrectFieldAsync(id, fieldId, request.CorrectedValue, cancellationToken);
        return Ok(updated);
    }

    [Authorize(Policy = PolicyNames.RequireReviewer)]
    [HttpPost("{id:guid}/approve")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Approve(
        Guid id,
        [FromBody] ReviewDecisionRequest? request,
        CancellationToken cancellationToken)
    {
        await _reviewService.ApproveAsync(id, request?.Notes, cancellationToken);
        return NoContent();
    }

    [Authorize(Policy = PolicyNames.RequireReviewer)]
    [HttpPost("{id:guid}/reject")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Reject(
        Guid id,
        [FromBody] RejectDocumentRequest request,
        CancellationToken cancellationToken)
    {
        await _reviewService.RejectAsync(id, request.Reason, cancellationToken);
        return NoContent();
    }
}

