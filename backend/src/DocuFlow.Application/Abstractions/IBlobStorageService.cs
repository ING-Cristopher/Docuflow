namespace DocuFlow.Application.Abstractions;

public interface IBlobStorageService
{
    string ContainerName { get; }
    Task UploadAsync(string blobPath, Stream content, string contentType, CancellationToken cancellationToken = default);
    Task<Stream> DownloadAsync(string blobPath, CancellationToken cancellationToken = default);
}

