# Validación E2E del Sistema Completo — DocuFlow AI

Fecha: 2026-11-13  
Entorno validado:
- **Infraestructura:** Docker Compose (`docuflow-sqlserver` SQL Server 2022 en `127.0.0.1:1433`, `docuflow-azurite` Azurite 3.37.0 en `127.0.0.1:10000-10002`)
- **Backend:** `DocuFlow.API` (.NET 10 en `http://localhost:5029`) + `DocuFlow.Worker` (procesamiento asíncrono en segundo plano)
- **Frontend:** Vite + React 18 + TypeScript en `http://localhost:5174`

---

## 1. Errores Encontrados y Correcciones Realizadas durante la Validación E2E

1. **Desajuste de puerto por defecto entre Frontend y Backend:**
   - *Problema:* `DocuFlow.API` escucha por defecto en `http://localhost:5029` (`launchSettings.json`), mientras el frontend apuntaba inicialmente a `http://localhost:5000`.
   - *Corrección:* Actualizados `frontend/.env.example`, `frontend/.env` y `frontend/src/lib/env.ts` para usar `http://localhost:5029`.
2. **Colisión de puerto `5173` con otra aplicación local del usuario ("HelpDesk ITSM"):**
   - *Problema:* El puerto `5173` estaba ocupado por otro proyecto en el host, redirigiendo al usuario hacia esa aplicación.
   - *Corrección:* Configurado **DocuFlow AI** en el puerto **`5174`** (`frontend/vite.config.ts`, `frontend/playwright.config.ts`, `frontend/e2e/run-e2e.sh`) y actualizado `backend/src/DocuFlow.API/Program.cs` para incluir `http://localhost:5174` en los orígenes CORS por defecto de desarrollo.
3. **Nombre de acción de auditoría en UI y pruebas:**
   - *Problema:* El filtro de auditoría en `AuditPage.tsx` mostraba el ejemplo `Document.Approved`, cuando el backend (`DocumentReviewService.cs`) persiste `"DocumentApproved"` y `"DocumentRejected"`.
   - *Corrección:* Corregido el placeholder en `frontend/src/features/audit/AuditPage.tsx` y las aserciones E2E a `DocumentApproved`.
4. **Semilla de demostración (`DbInitializer.cs`) omitida cuando ya existen organizaciones:**
   - *Observación:* `DbInitializer` omite sembrar `docuflow-demo` (`admin@docuflow.local` / `reviewer@docuflow.local`) si `Organizations.AnyAsync()` es verdadero (por ejemplo, tras ejecutar `RealDockerInfrastructureTests`).
   - *Solución en pruebas:* Las suites E2E crean sus propias organizaciones/usuarios de prueba de forma idempotente vía `/api/auth/register` y `/api/auth/members`.

---

## 2. Flujos Funcionales y de Seguridad Verificados contra el Stack Real

Suite ejecutada: `frontend/e2e/api-stack.e2e.spec.ts` contra `http://localhost:5174`, `http://localhost:5029`, `DocuFlow.Worker`, SQL Server 2022 y Azurite:

| Flujo / Control | Resultado | Verificación real observada |
| :--- | :---: | :--- |
| Disponibilidad Frontend + `/health` API/SQL Server | **Pasado** (`2/2` en `9.4s`) | `GET http://localhost:5174` (`200 OK`, contiene `DocuFlow AI`) y `GET /health` (`200 OK`, `{"status":"healthy","database":"connected"}`). |
| Registro de organización (`POST /api/auth/register`) | Probado | `201 Created` con emisión de JWT. |
| Inicio de sesión (`POST /api/auth/login`) | Probado | `200 OK`. |
| Carga de PDF válido (`POST /api/documents`) | Probado | `201 Created`, almacenamiento privado en Azurite. |
| Descarga autorizada desde Azurite (`GET /api/documents/{id}/download`) | Probado | `200 OK`, contenido `%PDF-1.4` íntegro. |
| Procesamiento asíncrono real con `DocuFlow.Worker` | Probado | Transición real `Queued` -> `PendingReview` con `ExtractedFields` generados. |
| Corrección de campo extraído (`PATCH /api/documents/{id}/fields/{fieldId}`) | Probado | `200 OK`, `correctedValue` guardado e `isValidated: true`. |
| Aprobación (`POST /api/documents/{id}/approve`) | Probado | `204 No Content`. |
| Rechazo con motivo (`POST /api/documents/{id}/reject`) | Probado | `204 No Content`. |
| Auditoría (`GET /api/audit-logs?action=DocumentApproved`) | Probado | `200 OK` con registro real `DocumentApproved`. |
| Cambio de organización (`POST /api/auth/switch-organization`) | Probado | `200 OK` con nuevo JWT acotado a la Organización B. |
| Aislamiento multi-tenant cruzado (Org B -> documento Org A) | Probado | `404 Not Found` en lectura y descarga. |
| Acceso sin autenticación / URL descarga directa sin token | Probado | `401 Unauthorized`. |
| Manipulación de ID inexistente | Probado | `404 Not Found`. |
| Acceso a endpoint administrativo con rol `Reviewer` | Probado | `403 Forbidden` en `GET /api/audit-logs`. |

---

## 3. Pruebas que No Pudieron Ejecutarse Automáticamente

- **Suite de navegador UI completo (`frontend/e2e/docuflow.e2e.spec.ts` en Chromium headless):**
  - *Motivo:* El binario de Chromium de Playwright en Ubuntu WSL2 requiere librerías del sistema (`libnspr4.so`) que exigen `sudo` interactivo:
    ```bash
    cd /home/crist_r5h2ajz/projects/DocuFlow/frontend
    sudo env "PATH=$PATH" npx playwright install-deps chromium
    ```
  - *Cobertura alternativa verificada:* Los flujos de UI, formularios, rutas protegidas, interceptor `401` y permisos por rol están cubiertos en `frontend/tests/` (Vitest + React Testing Library, `12/12` pasadas), y la comunicación real full-stack está verificada en `frontend/e2e/api-stack.e2e.spec.ts`.

---

## 4. Cómo Ejecutar las Pruebas E2E

```bash
# 1. Levantar infraestructura
docker compose up -d

# 2. Ejecutar el script reproducible completo (compila backend, levanta API, Worker y Vite, y corre Playwright)
bash frontend/e2e/run-e2e.sh
```

---

## 5. Problemas Pendientes y Evaluación Integral

- **Pendiente de ejecución en navegador real:** Ejecutar `frontend/e2e/docuflow.e2e.spec.ts` tras instalar `playwright install-deps chromium` con `sudo`.
- **Pendiente de fase posterior (Cloud):** Pruebas contra Azure AI Document Intelligence real (actualmente en modo mock local `DOCUMENT_INTELLIGENCE_USE_MOCK=true`).
- **Evaluación:** El sistema completo (**Frontend React + API .NET 10 + Worker + SQL Server 2022 + Azurite**) opera de forma integrada, segura y estable en entorno local para pruebas manuales en `http://localhost:5174` y validación automatizada.
