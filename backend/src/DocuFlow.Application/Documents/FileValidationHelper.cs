using System.Security.Cryptography;
using DocuFlow.Domain.Common;

namespace DocuFlow.Application.Documents;

public static class FileValidationHelper
{
    public const long MaxFileSizeBytes = 25 * 1024 * 1024; // 25 MB

    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/tiff"
    };

    private static readonly Dictionary<string, string[]> AllowedExtensionsByContentType = new(StringComparer.OrdinalIgnoreCase)
    {
        ["application/pdf"] = [".pdf"],
        ["image/png"] = [".png"],
        ["image/jpeg"] = [".jpg", ".jpeg"],
        ["image/tiff"] = [".tif", ".tiff"]
    };

    public static async Task<string> ValidateAndComputeSha256Async(
        Stream stream,
        string fileName,
        string contentType,
        long sizeBytes,
        CancellationToken cancellationToken = default)
    {
        if (sizeBytes <= 0 || sizeBytes > MaxFileSizeBytes)
            throw new DomainException("File.InvalidSize", $"File size must be between 1 byte and {MaxFileSizeBytes / (1024 * 1024)} MB.");

        if (!AllowedContentTypes.Contains(contentType))
            throw new DomainException("File.UnsupportedType", $"Content type '{contentType}' is not supported.");

        var ext = Path.GetExtension(fileName);
        if (string.IsNullOrWhiteSpace(ext) || !AllowedExtensionsByContentType[contentType].Contains(ext, StringComparer.OrdinalIgnoreCase))
            throw new DomainException("File.ExtensionMismatch", $"File extension '{ext}' does not match content type '{contentType}'.");

        var header = new byte[8];
        var read = await stream.ReadAsync(header.AsMemory(0, header.Length), cancellationToken);
        if (!MatchesSignature(contentType, header.AsSpan(0, read)))
            throw new DomainException("File.InvalidSignature", "File content signature does not match the declared file type.");

        stream.Position = 0;
        var hashBytes = await SHA256.HashDataAsync(stream, cancellationToken);
        stream.Position = 0;
        return Convert.ToHexStringLower(hashBytes);
    }

    private static bool MatchesSignature(string contentType, ReadOnlySpan<byte> header)
    {
        return contentType.ToLowerInvariant() switch
        {
            "application/pdf" => header.Length >= 4 && header[0] == 0x25 && header[1] == 0x50 && header[2] == 0x44 && header[3] == 0x46, // %PDF
            "image/png" => header.Length >= 8 && header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47, // PNG
            "image/jpeg" => header.Length >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF, // JPEG
            "image/tiff" => header.Length >= 4 &&
                ((header[0] == 0x49 && header[1] == 0x49 && header[2] == 0x2A && header[3] == 0x00) ||
                 (header[0] == 0x4D && header[1] == 0x4D && header[2] == 0x00 && header[3] == 0x2A)),
            _ => false
        };
    }

    public static string SanitizeFileName(string fileName)
    {
        var baseName = Path.GetFileName(fileName);
        var invalid = Path.GetInvalidFileNameChars();
        var cleaned = new string(baseName.Select(c => invalid.Contains(c) ? '_' : c).ToArray());
        return string.IsNullOrWhiteSpace(cleaned) ? "document" : cleaned;
    }
}

