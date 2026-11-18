using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace DocuFlow.Application.Abstractions;

public interface IDocumentAgentService
{
    Task<AgentChatResponse> ChatAsync(AgentChatRequest request, CancellationToken cancellationToken = default);
}

public interface IAgentTool
{
    string Name { get; }
    string Description { get; }
    object ParametersSchema { get; }
    Task<object> ExecuteAsync(JsonElement arguments, CancellationToken cancellationToken = default);
}

public sealed class AgentChatRequest
{
    public const int MaxMessageLength = 2000;
    public const int MaxDocumentContentLength = 6000;
    public const int MaxHistoryTurns = 10;

    [Required(ErrorMessage = "El mensaje es obligatorio.")]
    [StringLength(MaxMessageLength, MinimumLength = 1, ErrorMessage = "El mensaje debe tener entre 1 y 2000 caracteres.")]
    public string Message { get; init; } = string.Empty;

    public Guid? DocumentId { get; init; }

    [StringLength(MaxDocumentContentLength, ErrorMessage = "El contenido del documento compartido no puede superar los 6000 caracteres.")]
    public string? DocumentContent { get; init; }

    public IReadOnlyList<AgentChatTurn>? History { get; init; }
}

public sealed class AgentChatTurn
{
    [Required]
    [RegularExpression("^(user|model)$", ErrorMessage = "El rol debe ser 'user' o 'model'.")]
    public string Role { get; init; } = "user";

    [Required]
    [StringLength(AgentChatRequest.MaxMessageLength, MinimumLength = 1)]
    public string Content { get; init; } = string.Empty;
}

public sealed record AgentChatResponse(
    string Reply,
    string Model,
    IReadOnlyList<string> ExecutedTools,
    DateTimeOffset TimestampUtc);
