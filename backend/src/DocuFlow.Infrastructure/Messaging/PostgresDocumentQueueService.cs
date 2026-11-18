using System.Text.Json;
using DocuFlow.Application.Abstractions;
using Npgsql;

namespace DocuFlow.Infrastructure.Messaging;

/// <summary>
/// Durable work queue on PostgreSQL using FOR UPDATE SKIP LOCKED.
/// Semantics mirror a visibility-timeout queue: received messages become invisible for
/// <see cref="VisibilityTimeout"/>; if the worker crashes before completing, they reappear
/// and DequeueCount increases (poison handling stays in the Worker).
/// </summary>
public sealed class PostgresDocumentQueueService : IDocumentQueueService, IAsyncDisposable, IDisposable
{
    private readonly NpgsqlDataSource _dataSource;

    public TimeSpan VisibilityTimeout { get; }

    public PostgresDocumentQueueService(string connectionString, TimeSpan? visibilityTimeout = null)
    {
        _dataSource = NpgsqlDataSource.Create(connectionString);
        VisibilityTimeout = visibilityTimeout ?? TimeSpan.FromMinutes(5);
    }

    public async Task EnqueueAsync(DocumentProcessingMessage message, CancellationToken cancellationToken = default)
    {
        const string sql = """
            INSERT INTO "DocumentQueueMessages"
                ("Id", "OrganizationId", "PayloadJson", "EnqueuedAt", "VisibleAt", "DequeueCount", "PopReceipt")
            VALUES (@id, @orgId, @payload, now(), now(), 0, NULL);
            """;

        await using var cmd = _dataSource.CreateCommand(sql);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid());
        cmd.Parameters.AddWithValue("orgId", message.OrganizationId);
        cmd.Parameters.AddWithValue("payload", JsonSerializer.Serialize(message));
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<QueuedDocumentEnvelope>> ReceiveBatchAsync(
        int maxMessages = 5,
        CancellationToken cancellationToken = default)
    {
        const string sql = """
            UPDATE "DocumentQueueMessages" AS q
            SET "VisibleAt" = now() + make_interval(secs => @visibilitySeconds),
                "DequeueCount" = q."DequeueCount" + 1,
                "PopReceipt" = gen_random_uuid()
            WHERE q."Id" IN (
                SELECT "Id" FROM "DocumentQueueMessages"
                WHERE "VisibleAt" <= now()
                ORDER BY "EnqueuedAt"
                LIMIT @limit
                FOR UPDATE SKIP LOCKED)
            RETURNING q."Id", q."PayloadJson", q."DequeueCount", q."PopReceipt";
            """;

        await using var cmd = _dataSource.CreateCommand(sql);
        cmd.Parameters.AddWithValue("visibilitySeconds", VisibilityTimeout.TotalSeconds);
        cmd.Parameters.AddWithValue("limit", Math.Clamp(maxMessages, 1, 32));

        var envelopes = new List<QueuedDocumentEnvelope>();
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var id = reader.GetGuid(0);
            var payloadJson = reader.GetString(1);
            var dequeueCount = reader.GetInt32(2);
            var popReceipt = reader.GetGuid(3);

            DocumentProcessingMessage? payload = null;
            try
            {
                payload = JsonSerializer.Deserialize<DocumentProcessingMessage>(payloadJson);
            }
            catch (JsonException)
            {
                // Malformed payload will be handled and deleted by the worker.
            }

            envelopes.Add(new QueuedDocumentEnvelope(id.ToString(), popReceipt.ToString(), dequeueCount, payload));
        }

        return envelopes;
    }

    public async Task CompleteAsync(string messageId, string popReceipt, CancellationToken cancellationToken = default)
    {
        if (!Guid.TryParse(messageId, out var id) || !Guid.TryParse(popReceipt, out var receipt))
            return;

        // PopReceipt guard: a worker whose lease expired cannot delete a message re-leased by another worker.
        const string sql = """
            DELETE FROM "DocumentQueueMessages" WHERE "Id" = @id AND "PopReceipt" = @receipt;
            """;

        await using var cmd = _dataSource.CreateCommand(sql);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("receipt", receipt);
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    public ValueTask DisposeAsync() => _dataSource.DisposeAsync();

    public void Dispose() => _dataSource.Dispose();
}
