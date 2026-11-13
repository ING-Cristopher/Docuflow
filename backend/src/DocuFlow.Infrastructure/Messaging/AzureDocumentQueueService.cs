using System.Text.Json;
using Azure.Storage.Queues;
using DocuFlow.Application.Abstractions;

namespace DocuFlow.Infrastructure.Messaging;

public sealed class AzureDocumentQueueService : IDocumentQueueService
{
    private readonly QueueClient _queueClient;

    public AzureDocumentQueueService(QueueClient queueClient)
    {
        _queueClient = queueClient;
    }

    public async Task EnqueueAsync(DocumentProcessingMessage message, CancellationToken cancellationToken = default)
    {
        await _queueClient.CreateIfNotExistsAsync(cancellationToken: cancellationToken);
        var json = JsonSerializer.Serialize(message);
        await _queueClient.SendMessageAsync(json, cancellationToken);
    }

    public async Task<IReadOnlyList<QueuedDocumentEnvelope>> ReceiveBatchAsync(
        int maxMessages = 5,
        CancellationToken cancellationToken = default)
    {
        await _queueClient.CreateIfNotExistsAsync(cancellationToken: cancellationToken);
        var response = await _queueClient.ReceiveMessagesAsync(
            maxMessages: maxMessages,
            visibilityTimeout: TimeSpan.FromMinutes(2),
            cancellationToken: cancellationToken);

        var envelopes = new List<QueuedDocumentEnvelope>(response.Value.Length);
        foreach (var msg in response.Value)
        {
            DocumentProcessingMessage? payload = null;
            try
            {
                payload = JsonSerializer.Deserialize<DocumentProcessingMessage>(msg.Body.ToString());
            }
            catch (JsonException)
            {
                // Malformed payload will be handled and deleted by the worker.
            }

            envelopes.Add(new QueuedDocumentEnvelope(msg.MessageId, msg.PopReceipt, msg.DequeueCount, payload));
        }

        return envelopes;
    }

    public async Task CompleteAsync(string messageId, string popReceipt, CancellationToken cancellationToken = default)
    {
        await _queueClient.DeleteMessageAsync(messageId, popReceipt, cancellationToken);
    }
}
