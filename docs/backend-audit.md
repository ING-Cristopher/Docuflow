# Auditoría Técnica Integral del Backend — DocuFlow AI

Fecha: 2026-11-13  
Alcance: Solución .NET 10 (`backend/DocuFlow.sln`), seguridad y autenticación, aislamiento multi-tenant, persistencia SQL Server / EF Core, almacenamiento y colas en Azure (Azurite), procesamiento documental, flujo de revisión humana y ejecución contra infraestructura real en Docker Compose.

---

## 1. Resumen Ejecutivo

La auditoría del código real del backend identificó vulnerabilidades y fallos operativos relevantes que no eran visibles en las pruebas iniciales con SQLite/dobles en memoria. Las incidencias críticas y altas detectadas durante la revisión y las pruebas contra Docker real fueron corregidas y verificadas mediante pruebas automatizadas.

**Estado actual:** Apto para continuar hacia el desarrollo del frontend y pruebas en entorno local/staging, con **brechas pendientes documentadas** antes de un despliegue a producción pública.

---

## 2. Hallazgos, Riesgos y Correcciones Realizadas

| ID | Severidad | Área | Hallazgo | Archivo(s) afectado(s) | Corrección aplicada | Estado |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **AUD-01** | Crítica | Seguridad / Autorización | Un usuario con rol `Admin` podía invitar o asignar el rol `Owner` a otro usuario en `AuthService.AddMemberAsync`, produciendo escalamiento de privilegios. Además, no se bloqueaba explícitamente la membresía de usuarios inactivos. | `backend/src/DocuFlow.Application/Security/AuthService.cs` | Validación explícita: solo `OrganizationRole.Owner` puede asignar `Owner` (`Auth.InsufficientPermissions` -> `403 Forbidden`); se rechazan usuarios con `!user.IsActive` (`Auth.UserInactive`). | **Corregido y probado** |
| **AUD-02** | Alta | Seguridad / Sesiones | Los tokens JWT permanecían válidos hasta su expiración (60 min) incluso tras desactivar una membresía, usuario u organización. | `backend/src/DocuFlow.API/Program.cs` | En `JwtBearerEvents.OnTokenValidated` se consulta `OrganizationMemberships.IgnoreQueryFilters()` verificando que membresía, usuario y organización sigan activos (`IsActive == true`). | **Corregido y probado** |
| **AUD-03** | Alta | Infraestructura / Azurite | `Azure.Storage.Blobs` `12.30.1` enviaba `x-ms-version: 2026-10-06`, rechazada por `Azurite-Blob/3.37.0` con `400 InvalidHeaderValue` (`The API version 2026-10-06 is not supported by Azurite`). | `docker-compose.yml` | Se añadió `--skipApiVersionCheck` al servicio `azurite` y se recreó el contenedor. | **Corregido y probado** |
| **AUD-04** | Alta | Worker / Consistencia asíncrona | El guardado en base de datos y el encolado en Azure Queue no eran atómicos: una caída de cola dejaba documentos huérfanos en estado `Queued`. | `backend/src/DocuFlow.Domain/Common/OutboxMessage.cs`<br>`backend/src/DocuFlow.Application/Documents/DocumentService.cs`<br>`backend/src/DocuFlow.Application/Processing/DocumentProcessingService.cs`<br>`backend/src/DocuFlow.Worker/Worker.cs` | Se implementó el patrón **Transactional Outbox** (`OutboxMessage` persistido en la misma transacción que `Document` en `SaveChangesAsync`), junto con `DispatchPendingOutboxAsync` invocado en el ciclo de `Worker.ExecuteAsync`. | **Corregido y probado** |
| **AUD-05** | Media | Persistencia / Concurrencia | `Document` y `ExtractedField` carecían de control de concurrencia optimista, y `ExtractedField` no tenía llaves foráneas explícitas hacia `Document` y `DocumentVersion`. | `backend/src/DocuFlow.Domain/`<br>`backend/src/DocuFlow.Infrastructure/Persistence/` | Se añadió `byte[] RowVersion` (`IsRowVersion()` en SQL Server y fallback `ValueGeneratedNever().IsConcurrencyToken()` en SQLite) en `Document` y `ExtractedField`, además de FKs explícitas con `DeleteBehavior.Restrict` y la migración `20261113160358_AddOutboxAndConcurrencyTokens`. | **Corregido y probado** |
| **AUD-06** | Media | Manejo de errores HTTP | `BadHttpRequestException` (por ejemplo, `413 Payload Too Large`) y `DbUpdateConcurrencyException` no tenían mapeo específico y terminaban como `500 Internal Server Error`. | `backend/src/DocuFlow.API/Middleware/ExceptionHandlingMiddleware.cs` | Mapeo de `DbUpdateConcurrencyException` a `409 Conflict`, `BadHttpRequestException` a `ex.StatusCode`, y `Auth.InsufficientPermissions` a `403 Forbidden`. | **Corregido y probado** |
| **AUD-07** | Media | Rendimiento / Memoria | `DocumentsController.Upload` copiaba incondicionalmente el archivo recibido a un `MemoryStream` de hasta 25 MB. | `backend/src/DocuFlow.API/Controllers/DocumentsController.cs` | Uso directo de `file.OpenReadStream()` cuando el stream soporta `CanSeek` para evitar copias innecesarias en memoria. | **Corregido** |
| **AUD-08** | Baja | Operación / Frontend | Faltaban política CORS configurable para el frontend y verificación real de conectividad DB en `/health`. | `backend/src/DocuFlow.API/Program.cs` | Configurada política CORS `FrontendPolicy` (`Cors:AllowedOrigins` / `FRONTEND_ORIGIN` / `http://localhost:5173`) y `/health` ejecuta `db.Database.CanConnectAsync(ct)` devolviendo `503` si la base no responde. | **Corregido** |

---

## 3. Verificación contra Infraestructura Real (Docker Compose)

- **SQL Server 2022 (`docuflow-sqlserver`, `127.0.0.1:1433`):**
  - Migraciones aplicadas con `dotnet dotnet-ef database update`: `20261113145613_InitialCreate` y `20261113160358_AddOutboxAndConcurrencyTokens`. Resultado: `Done.` (código de salida `0`).
  - Prueba de integración real `RealSqlServer_And_Azurite_EndToEndSmokeTest` verificó `CanConnectAsync` y generación de `RowVersion` en SQL Server 2022.
- **Azurite (`docuflow-azurite`, `127.0.0.1:10000-10002`):**
  - Verificado `PublicAccessType.None` en Blob Storage (sin URLs públicas), carga/descarga de blobs y ciclo enqueue/receive/delete en Queue Storage.

---

## 4. Pruebas Ejecutadas y Resultados Observados

Comando ejecutado tras los últimos cambios:

```bash
DOCUFLOW_RUN_DOCKER_TESTS=true dotnet test DocuFlow.sln --no-build
```

Resultados exactos observados:

- **`DocuFlow.UnitTests.dll` (`net10.0`):** `Passed! - Failed: 0, Passed: 12, Skipped: 0, Total: 12`
- **`DocuFlow.IntegrationTests.dll` (`net10.0`):** `Passed! - Failed: 0, Passed: 8, Skipped: 0, Total: 8`
- **Código de salida:** `0`

Cobertura negativa y multi-tenant destacada en `DocuFlow.IntegrationTests`:
- `Security_AdminCannotEscalateToOwner_AndDeactivatedMembershipIsRevokedImmediately` (`DocuFlowApiIntegrationTests.cs`)
- `Security_SpoofedPdfUpload_Returns400BadRequest` (`DocuFlowApiIntegrationTests.cs`)
- Aislamiento cruzado de `AuditLog` entre organizaciones (`DocuFlowApiIntegrationTests.cs`)
- `RealSqlServer_And_Azurite_EndToEndSmokeTest` (`RealDockerInfrastructureTests.cs`)

---

## 5. Limitaciones de las Pruebas

1. **`AzureDocumentIntelligenceService` no fue probado contra un recurso real de Azure AI Document Intelligence**, ya que no existen credenciales ni recursos desplegados en la nube durante esta fase; la validación funcional se realizó mediante `MockDocumentIntelligenceService`.
2. **El bucle de sondeo continuo de `DocuFlow.Worker` (`ExecuteAsync`) no se ejecutó como daemon de larga duración** en las pruebas automatizadas; se probaron directamente sus servicios subyacentes (`DocumentProcessingService`, `AzureDocumentQueueService`, `AzureBlobStorageService`).

---

## 6. Problemas Pendientes / Recomendaciones Pre-Producción

1. **Rate limiting en autenticación:** Añadir limitación de tasa en `/api/auth/login` y `/api/auth/register` antes de exponer la API a Internet.
2. **Restricciones FK faltantes:** `ExtractionRun` y `ValidationIssue` aún no tienen llaves foráneas explícitas en EF Core hacia `Document` (solo `ExtractedField` y `DocumentVersion` las tienen).
3. **Endpoint de versionado documental:** `POST /api/documents/{id}/versions` aún no está expuesto en `DocumentsController`.
4. **Clave JWT de respaldo en desarrollo:** `Program.cs` mantiene una clave de respaldo (`DOCUFLOW_DEV_ONLY_FALLBACK_KEY_MIN_32_CHARS`) únicamente en `Development`/`Testing`; en `Production` falla al arrancar si `Jwt:SecretKey` tiene menos de 32 caracteres. Verificar siempre la inyección segura vía Key Vault/variables de entorno al desplegar.

---

## 7. Evaluación Final de Preparación para Producción

- **Listo para desarrollo de Frontend y pruebas locales/CI:** **Sí.** La arquitectura Modular Monolith, el aislamiento multi-tenant, la seguridad JWT/RBAC, la persistencia en SQL Server 2022, el almacenamiento privado en Azurite y el Outbox transaccional están verificados.
- **Listo para producción pública sin cambios adicionales:** **No todavía.** Requiere cerrar los puntos de la sección 6 (rate limiting en auth, FKs en `ExtractionRun`/`ValidationIssue`) y ejecutar pruebas de integración reales contra Azure AI Document Intelligence y `DocuFlow.Worker` en modo daemon antes del paso a producción.

