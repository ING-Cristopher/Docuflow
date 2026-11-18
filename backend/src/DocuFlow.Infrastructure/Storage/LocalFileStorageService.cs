using DocuFlow.Application.Abstractions;
using DocuFlow.Domain.Common;

namespace DocuFlow.Infrastructure.Storage;

/// <summary>
/// Stores document binaries on a private local/volume-mounted directory.
/// Files are never served directly: downloads always go through the authorized API.
/// Layout: {root}/{container}/{blobPath}, where blobPath is generated server-side
/// as "{organizationId}/{documentId}/v{n}/{sanitizedFileName}".
/// </summary>
public sealed class LocalFileStorageService : IBlobStorageService
{
    private readonly string _containerRoot;

    public string ContainerName { get; }

    public LocalFileStorageService(string rootPath, string containerName)
    {
        if (string.IsNullOrWhiteSpace(rootPath))
            throw new ArgumentException("Document storage root path is required.", nameof(rootPath));

        ContainerName = string.IsNullOrWhiteSpace(containerName) ? "documents" : containerName.Trim();
        if (ContainerName.Contains('/') || ContainerName.Contains('\\') || ContainerName.Contains(".."))
            throw new ArgumentException("Invalid storage container name.", nameof(containerName));

        _containerRoot = Path.GetFullPath(Path.Combine(rootPath, ContainerName));
        Directory.CreateDirectory(_containerRoot);
    }

    public async Task UploadAsync(
        string blobPath,
        Stream content,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        var fullPath = ResolveSafePath(blobPath);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);

        if (content.CanSeek)
            content.Position = 0;

        // Write to a temp file first and move atomically so readers never see partial files.
        var tempPath = $"{fullPath}.{Guid.NewGuid():N}.tmp";
        try
        {
            await using (var target = new FileStream(
                tempPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, useAsync: true))
            {
                await content.CopyToAsync(target, cancellationToken);
            }

            File.Move(tempPath, fullPath, overwrite: true);
        }
        finally
        {
            if (File.Exists(tempPath))
                File.Delete(tempPath);
        }
    }

    public Task<Stream> DownloadAsync(string blobPath, CancellationToken cancellationToken = default)
    {
        var fullPath = ResolveSafePath(blobPath);
        if (!File.Exists(fullPath))
        {
            throw new DomainException(
                "Document.FileNotFound",
                "El archivo del documento no está disponible en el almacenamiento.");
        }

        Stream stream = new FileStream(
            fullPath, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
        return Task.FromResult(stream);
    }

    private string ResolveSafePath(string blobPath)
    {
        if (string.IsNullOrWhiteSpace(blobPath) || Path.IsPathRooted(blobPath))
            throw new DomainException("Storage.InvalidPath", "Invalid storage path.");

        var fullPath = Path.GetFullPath(Path.Combine(_containerRoot, blobPath));
        var rootWithSeparator = _containerRoot.EndsWith(Path.DirectorySeparatorChar)
            ? _containerRoot
            : _containerRoot + Path.DirectorySeparatorChar;

        // Prevent path traversal outside the private container directory.
        if (!fullPath.StartsWith(rootWithSeparator, StringComparison.Ordinal))
            throw new DomainException("Storage.InvalidPath", "Invalid storage path.");

        return fullPath;
    }
}
