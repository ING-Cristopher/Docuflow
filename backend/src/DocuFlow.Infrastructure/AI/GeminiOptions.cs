namespace DocuFlow.Infrastructure.AI;

public sealed class GeminiAgentOptions
{
    public const string SectionName = "Gemini";

    public string ApiKey { get; set; } = string.Empty;
    public string Model { get; set; } = "gemini-3.5-flash";
    public string[] FallbackModels { get; set; } =
    [
        "gemini-3.1-flash-lite",
        "gemini-3-flash-preview",
        "gemini-3.8-flash"
    ];
    public string BaseUrl { get; set; } = "https://generativelanguage.googleapis.com/v1beta/";
    public int MaxOutputTokens { get; set; } = 1024;
    public double Temperature { get; set; } = 0.2;
    public string SystemInstruction { get; set; } =
        "Eres el agente especialista en extracción y análisis documental de DocuFlow AI. " +
        "Tu función principal es extraer, resumir y explicar la información más relevante de los documentos compartidos según su contenido real. " +
        "Usa las herramientas disponibles para consultar los datos extraídos del documento en la organización activa, responde en español de forma clara y nunca inventes información que no esté en el documento.";
}
