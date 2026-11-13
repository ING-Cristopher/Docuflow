# DocuFlow AI — Arquitectura y Guía de Ejecución del Backend

## 1. Arquitectura Modular Monolith (.NET 10)

- **`DocuFlow.Domain`**: Entidades (`Organization`, `User`, `OrganizationMembership`, `Document`, `DocumentVersion`, `ExtractedField`, `ExtractionRun`, `ValidationIssue`, `AuditLog`), objeto de valor `ConfidenceScore`, contrato `ITenantEntity`, reglas de transición de estados y `DomainException`. Sin dependencias externas.
- **`DocuFlow.Application`**: Casos de uso (`AuthService`, `DocumentService`, `DocumentReviewService`, `DocumentProcessingService`, `AuditService`), validación de archivos (`FileValidationHelper` con firma binaria y SHA-256) y abstracciones (`IApplicationDbContext`, `ITenantContext`, `IBlobStorageService`, `IDocumentIntelligenceService`, `IDocumentQueueService`, `IJwtTokenGenerator`, `IPasswordHasher`).
- **`DocuFlow.Infrastructure`**: Persistencia EF Core 10 (`DocuFlowDbContext` con filtros globales multi-tenant *fail-closed*, configuraciones explícitas y migración `InitialCreate`), `Pbkdf2PasswordHasher`, `JwtTokenGenerator`, `AzureBlobStorageService` (contenedores privados), `AzureDocumentQueueService`, `AzureDocumentIntelligenceService` y `MockDocumentIntelligenceService`.
- **`DocuFlow.API`**: API REST ASP.NET Core 10 con autenticación JWT Bearer, políticas RBAC (`RequireViewer`, `RequireReviewer`, `RequireOperator`, `RequireAdmin`, `RequireOwner`), `HttpTenantContext`, `ExceptionHandlingMiddleware` (`ProblemDetails`) y OpenAPI (`/openapi/v1.json` en `Development`).
- **`DocuFlow.Worker`**: Servicio en segundo plano que consume mensajes de `document-processing` mediante `IDocumentQueueService`, ejecuta `DocumentProcessingService` con idempotencia, reintentos y descarte de mensajes envenenados.

## 2. Seguridad Multi-Tenant

- El `OrganizationId` se resuelve exclusivamente del claim `org_id` del JWT autenticado en `HttpTenantContext`.
- `DocuFlowDbContext` aplica filtros globales sobre todas las entidades `ITenantEntity`: sin contexto activo, las consultas devuelven 0 registros.
- Los documentos se almacenan en contenedores privados (`PublicAccessType.None`) y se descargan únicamente vía streaming autorizado (`GET /api/documents/{id}/download`).

## 3. Guía Reproducible de Ejecución Local (Ubuntu WSL2)

```bash
# 1. Preparar variables de entorno e infraestructura Docker
cd /home/crist_r5h2ajz/projects/DocuFlow
cp .env.example .env
docker compose up -d

# 2. Compilar y ejecutar pruebas automatizadas
cd /home/crist_r5h2ajz/projects/DocuFlow/backend
dotnet restore DocuFlow.sln
dotnet build DocuFlow.sln --no-restore
dotnet test DocuFlow.sln --no-build

# 3. Ejecutar API (aplica migraciones y seed en Development)
export SQL_CONNECTION_STRING="Server=localhost,1433;Database=DocuFlowDb;User Id=sa;Password=DocuFlow_Dev_Pass123!;TrustServerCertificate=True;MultipleActiveResultSets=true;"
export AZURE_STORAGE_CONNECTION_STRING="UseDevelopmentStorage=true;DevelopmentStorageProxyUri=http://127.0.0.1;"
export DOCUMENT_INTELLIGENCE_USE_MOCK=true
dotnet run --project src/DocuFlow.API/DocuFlow.API.csproj

# 4. En otra terminal, ejecutar el Worker asíncrono
dotnet run --project src/DocuFlow.Worker/DocuFlow.Worker.csproj
```

