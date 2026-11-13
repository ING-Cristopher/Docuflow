using DocuFlow.Application.Abstractions;
using DocuFlow.Application.Processing;

namespace DocuFlow.Worker;

public sealed class Worker : BackgroundService
{
    private readonly IDocumentQueueService _queueService;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<Worker> _logger;

    public Worker(
        IDocumentQueueService queueService,
        IServiceScopeFactory scopeFactory,
        ILogger<Worker> logger)
    {
        _queueService = queueService;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("DocuFlow Worker started, listening for queued documents.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using (var outboxScope = _scopeFactory.CreateScope())
                {
                    var processor = outboxScope.ServiceProvider.GetRequiredService<DocumentProcessingService>();
                    await processor.DispatchPendingOutboxAsync(stoppingToken);
                }

                var batch = await _queueService.ReceiveBatchAsync(maxMessages: 5, stoppingToken);

                if (batch.Count == 0)
                {
                    await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);
                    continue;
                }

                foreach (var envelope in batch)
                {
                    if (envelope.DequeueCount > 5 || envelope.Payload is null)
                    {
                        _logger.LogError("Poison or malformed message {MessageId} (dequeueCount={DequeueCount}). Deleting.",
                            envelope.MessageId, envelope.DequeueCount);
                        await _queueService.CompleteAsync(envelope.MessageId, envelope.PopReceipt, stoppingToken);
                        continue;
                    }

                    using var scope = _scopeFactory.CreateScope();
                    var processor = scope.ServiceProvider.GetRequiredService<DocumentProcessingService>();
                    await processor.ProcessAsync(envelope.Payload, stoppingToken);

                    await _queueService.CompleteAsync(envelope.MessageId, envelope.PopReceipt, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unhandled error in worker polling loop.");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }
    }
}
