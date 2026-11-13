using DocuFlow.Application.Documents;
using DocuFlow.Domain.Common;

namespace DocuFlow.UnitTests.Documents;

public sealed class FileValidationHelperTests
{
    [Fact]
    public async Task ValidateAndComputeSha256_ValidPdf_ReturnsSha256()
    {
        var pdfBytes = "%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"u8.ToArray();
        await using var stream = new MemoryStream(pdfBytes);

        var hash = await FileValidationHelper.ValidateAndComputeSha256Async(
            stream, "invoice.pdf", "application/pdf", pdfBytes.Length);

        Assert.Equal(64, hash.Length);
        Assert.Equal(0, stream.Position);
    }

    [Fact]
    public async Task ValidateAndComputeSha256_SpoofedPdfSignature_ThrowsDomainException()
    {
        var fakeBytes = "MZ_NOT_A_PDF_EXECUTABLE"u8.ToArray();
        await using var stream = new MemoryStream(fakeBytes);

        var ex = await Assert.ThrowsAsync<DomainException>(() =>
            FileValidationHelper.ValidateAndComputeSha256Async(
                stream, "evil.pdf", "application/pdf", fakeBytes.Length));

        Assert.Equal("File.InvalidSignature", ex.Code);
    }

    [Fact]
    public async Task ValidateAndComputeSha256_OversizedFile_ThrowsDomainException()
    {
        await using var stream = new MemoryStream([0x25, 0x50, 0x44, 0x46]);
        var ex = await Assert.ThrowsAsync<DomainException>(() =>
            FileValidationHelper.ValidateAndComputeSha256Async(
                stream, "huge.pdf", "application/pdf", FileValidationHelper.MaxFileSizeBytes + 1));

        Assert.Equal("File.InvalidSize", ex.Code);
    }

    [Fact]
    public void SanitizeFileName_StripsDirectoryTraversal()
    {
        var sanitized = FileValidationHelper.SanitizeFileName("../../etc/passwd.pdf");
        Assert.Equal("passwd.pdf", sanitized);
    }
}

