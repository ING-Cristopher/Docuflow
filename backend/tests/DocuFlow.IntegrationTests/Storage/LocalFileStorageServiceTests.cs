using DocuFlow.Domain.Common;
using DocuFlow.Infrastructure.Storage;

namespace DocuFlow.IntegrationTests.Storage;

public sealed class LocalFileStorageServiceTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"docuflow-lfs-{Guid.NewGuid():N}");

    [Fact]
    public async Task UploadThenDownload_RoundTripsBytes()
    {
        var storage = new LocalFileStorageService(_root, "documents");
        var bytes = "%PDF-1.4\n%DocuFlow\n"u8.ToArray();

        await using (var input = new MemoryStream(bytes))
            await storage.UploadAsync("org-1/doc-1/v1/file.pdf", input, "application/pdf");

        await using var output = await storage.DownloadAsync("org-1/doc-1/v1/file.pdf");
        using var ms = new MemoryStream();
        await output.CopyToAsync(ms);

        Assert.Equal(bytes, ms.ToArray());
        Assert.Empty(Directory.GetFiles(_root, "*.tmp", SearchOption.AllDirectories));
    }

    [Theory]
    [InlineData("../outside.pdf")]
    [InlineData("org-1/../../outside.pdf")]
    [InlineData("/etc/passwd")]
    public async Task PathTraversal_IsRejected(string maliciousPath)
    {
        var storage = new LocalFileStorageService(_root, "documents");

        await using var input = new MemoryStream([1, 2, 3]);
        var ex = await Assert.ThrowsAsync<DomainException>(() =>
            storage.UploadAsync(maliciousPath, input, "application/pdf"));
        Assert.Equal("Storage.InvalidPath", ex.Code);
    }

    [Fact]
    public async Task Download_MissingFile_ThrowsFileNotFoundDomainError()
    {
        var storage = new LocalFileStorageService(_root, "documents");

        var ex = await Assert.ThrowsAsync<DomainException>(() => storage.DownloadAsync("org-1/doc-x/v1/missing.pdf"));
        Assert.Equal("Document.FileNotFound", ex.Code);
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);
    }
}
