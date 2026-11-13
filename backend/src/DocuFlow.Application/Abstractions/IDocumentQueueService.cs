namespace DocuFlow.Application.Abstractions;

public sealed record DocumentProcessingMessage(
    Guid OrganizationId,
    Guid DocumentId,
    Guid DocumentVersionId,
    int Attempt = 1);

public sealed record QueuedDocumentEnvelope(
    string MessageId,
    string PopReceipt,
    long DequeueCount,
    DocumentProcessingMessage? Payload);

public interface IDocumentQueueService
{
    Task EnqueueAsync(DocumentProcessingMessage message, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<QueuedDocumentEnvelope>> ReceiveBatchAsync(int maxMessages = 5, CancellationToken cancellationToken = default);
    Task CompleteAsync(string messageId, string popReceipt, CancellationToken cancellationToken = default);
}
