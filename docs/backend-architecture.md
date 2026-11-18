# DocuFlow AI — Arquitectura y Guía de Ejecución del Backend

## 1. Arquitectura Modular Monolith (.NET 10)

- **`DocuFlow.Domain`**: Entidades (`Organization`, `User`, `OrganizationMembership`, `Document`, `DocumentVersion`, `ExtractedField`, `ExtractionRun`, `ValidationIssue`, `AuditLog`), objeto de valor `ConfidenceScore`, contrato `ITenantEntity`, reglas de transición de estados y `DomainException`. Sin dependencias externas.
- **`DocuFlow.Application`**: Casos de uso (`AuthService`, `DocumentService`, `DocumentReviewService`, `DocumentProcessingService`, `AuditService`), validación de archivos (`FileValidationHelper` con firma binaria y SHA-256), herramientas del agente (`DocumentSummaryAgentTool`, `DocumentExtractionAgentTool`) y abstracciones (`IApplicationDbContext`, `ITenantContext`, `IBlobStorageService`, `IDocumentIntelligenceService`, `IDocumentQueueService`, `IDocumentAgentService`, `IJwtTokenGenerator`, `IPasswordHasher`).
- **`DocuFlow.Infrastructure`**: Persistencia EF Core 10 con PostgreSQL (`DocuFlowDbContext` con filtros globales multi-tenant *fail-closed*, concurrencia optimista mediante `xmin`, configuraciones explícitas y migraciones en `Persistence/Migrations/PostgreSql`), `Pbkdf2PasswordHasher`, `JwtTokenGenerator`, `LocalFileStorageService` (almacenamiento privado en sistema de archivos / volumen Docker), `PostgresDocumentQueueService` (cola durable en PostgreSQL con `FOR UPDATE SKIP LOCKED`), `GeminiDocumentIntelligenceService`, `GeminiAgentService` y `MockDocumentIntelligenceService` (solo fallback determinista sin clave).
- **`DocuFlow.API`**: API REST ASP.NET Core 10 con autenticación JWT Bearer, políticas RBAC (`RequireViewer`, `RequireReviewer`, `RequireOperator`, `RequireAdmin`, `RequireOwner`), `HttpTenantContext`, `AgentController` (`POST /api/agent/chat` con Rate Limiting), `ExceptionHandlingMiddleware` (`ProblemDetails`) y OpenAPI (`/openapi/v1.json` en `Development`).
- **`DocuFlow.Worker`**: Servicio en segundo plano que consume mensajes de `DocumentQueueMessages` mediante `IDocumentQueueService`, ejecuta `DocumentProcessingService` con idempotencia, reintentos y descarte de mensajes envenenados.

## 2. Seguridad Multi-Tenant

- El `OrganizationId` se resuelve exclusivamente del claim `org_id` del JWT autenticado en `HttpTenantContext`.
- `DocuFlowDbContext` aplica filtros globales sobre todas las entidades `ITenantEntity`: sin contexto activo, las consultas devuelven 0 registros.
- Los documentos se almacenan en un directorio/volumen privado con protección contra *path traversal* y se descargan únicamente vía streaming autorizado (`GET /api/documents/{id}/download`).

## 3. Guía Reproducible de Ejecución Local (Ubuntu WSL2)

```bash
# 1. Preparar variables de entorno e infraestructura Docker (PostgreSQL 17)
cd /home/crist_r5h2ajz/projects/DocuFlow
cp .env.example .env
docker compose up -d postgres

# 2. Compilar y ejecutar pruebas automatizadas
cd /home/crist_r5h2ajz/projects/DocuFlow/backend
dotnet restore DocuFlow.sln
dotnet build DocuFlow.sln --no-restore
dotnet test DocuFlow.sln --no-build

# 3. Ejecutar API (aplica migraciones y seed en Development)
export POSTGRES_CONNECTION_STRING=$(grep "^POSTGRES_CONNECTION_STRING=" ../.env | cut -d= -f2-)
dotnet run --project src/DocuFlow.API/DocuFlow.API.csproj

# 4. En otra terminal, ejecutar el Worker asíncrono
dotnet run --project src/DocuFlow.Worker/DocuFlow.Worker.csproj
```

## 4. Extracción y Análisis con Google Gemini

- **Extracción multimodal (`GeminiDocumentIntelligenceService`):** Cuando `GEMINI_API_KEY` (o `Gemini:ApiKey`) está configurada y `DOCUMENT_INTELLIGENCE_FORCE_MOCK` no es `true`, el Worker envía el documento a Google Gemini (`gemini-3.5-flash` con fallback automático entre modelos) para extraer los campos reales del documento. Sin clave, usa `MockDocumentIntelligenceService`.
- **Análisis secundario opcional (`IDocumentAiAnalyzer`):** Opt-in mediante `AI_ANALYSIS_ENABLED=true` + `GEMINI_API_KEY` (`AI_ANALYSIS_USE_MOCK=true` para mock determinista).
  - Solo envía nombres/valores de campos extraídos, nunca el archivo original.
  - Su salida no es de confianza automática: únicamente añade `ValidationIssue`s (máximo `Warning`: `AI_TYPE_MISMATCH`, `AI_FINDING`), nunca modifica valores ni aprueba documentos.
  - Si falla, el procesamiento continúa y agrega `AI_ANALYSIS_UNAVAILABLE` para requerir revisión humana.
