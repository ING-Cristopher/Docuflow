# Arquitectura del Frontend — DocuFlow AI

## 1. Stack Tecnológico

- **React 18** + **TypeScript** (`strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`)
- **Vite 6** (servidor de desarrollo en `http://localhost:5173` y build de producción)
- **Tailwind CSS 3** (sistema visual SaaS B2B responsive)
- **TanStack Query v5** (estado del servidor, caché por `organizationId` e invalidación explícita)
- **React Router v7** (enrutamiento y protección de rutas por autenticación y rol)
- **React Hook Form** + **Zod** (`@hookform/resolvers`) para formularios y validaciones tipadas
- **Axios** (cliente HTTP centralizado con interceptores JWT y manejo de `401`)
- **Lucide React** (iconografía SVG ligera y consistente)
- **Vitest** + **React Testing Library** + **jsdom** (pruebas unitarias, de integración de servicios y flujos)

---

## 2. Estructura de Carpetas (`frontend/src`)

```text
frontend/
├── src/
│   ├── app/              # Composición raíz (QueryClientProvider, AuthProvider, BrowserRouter)
│   ├── components/
│   │   ├── layout/       # AppLayout (sidebar desktop, drawer móvil, cabecera, cierre de sesión)
│   │   └── ui/           # Alert, Badge, Button, Card, EmptyState, Modal, Pagination
│   ├── features/
│   │   ├── auth/         # LoginPage, RegisterPage, AuthContext, sessionStorage
│   │   ├── dashboard/    # DashboardPage (KPIs reales desde la API, actividad reciente, /health)
│   │   ├── organizations/# OrganizationPage (contexto activo, switch-organization, alta de miembros)
│   │   ├── documents/    # DocumentsPage, UploadDocumentModal, DocumentDetailPage
│   │   ├── reviews/      # ReviewsPage (bandeja de documentos PendingReview)
│   │   └── audit/        # AuditPage (historial paginado y filtrado por acción)
│   ├── lib/              # env.ts, errors.ts (ProblemDetails), formatters.ts
│   ├── routes/           # AppRoutes.tsx y ProtectedRoute.tsx
│   ├── schemas/          # Esquemas Zod (authSchemas.ts, documentSchemas.ts)
│   ├── services/         # apiClient.ts, authService.ts, documentsService.ts, auditService.ts, healthService.ts
│   └── types/            # Contratos TypeScript alineados con DTOs y enums de DocuFlow.API
├── tests/                # Pruebas automatizadas con Vitest + Testing Library
├── .env.example          # Variable VITE_API_BASE_URL
└── vite.config.ts / vitest.config.ts
```

---

## 3. Seguridad y Gestión de Sesión

- **Sin `localStorage` para tokens:** La sesión autenticada (`AuthResponse`) se guarda en memoria y `window.sessionStorage` (`docuflow.session`), evitando persistencia indefinida en `localStorage` entre sesiones de navegador.
- **Expiración / revocación (`401`):** El interceptor de respuesta en `apiClient.ts` detecta `401 Unauthorized` en rutas protegidas, limpia la sesión, limpia la caché de TanStack Query y redirige a `/login` mostrando un aviso claro.
- **Autorización y Multi-tenancy:**
  - El frontend nunca envía `OrganizationId` arbitrario en las peticiones de negocio; el backend lo extrae del JWT firmado.
  - Los controles visuales y `ProtectedRoute` reflejan `PolicyNames` del backend (`Viewer`, `Reviewer`, `Operator`, `Admin`, `Owner`), manteniendo al backend como autoridad final.
  - En `OrganizationPage`, el rol `Owner` solo es seleccionable si el usuario autenticado posee rol `Owner`.
- **Prevención XSS:** Todo contenido proveniente de la API o de extracción OCR (`DetailsJson`, `LastError`, campos extraídos) se renderiza como texto React seguro sin `dangerouslySetInnerHTML`.

---

## 4. Integración con el Backend y Limitaciones Conocidas

| Funcionalidad | Endpoint real utilizado | Notas / Limitaciones del backend |
| :--- | :--- | :--- |
| Registro e inicio de sesión | `POST /api/auth/register`, `POST /api/auth/login` | El backend emite JWT (60 min) en JSON; no existe endpoint de refresh token ni cookies `HttpOnly`. |
| Cambio de organización | `GET /api/auth/memberships`, `POST /api/auth/switch-organization` | Reemite JWT con el nuevo `OrganizationId` y limpia la caché de React Query. |
| Gestión de miembros | `POST /api/auth/members` | El backend no expone aún `GET /api/auth/members` ni endpoints para editar/desactivar miembros existentes. |
| Dashboard | `GET /api/documents` (por estado), `GET /api/audit-logs`, `GET /health` | No existe endpoint agregado `/api/dashboard/summary`; las métricas se calculan con conteos reales (`totalCount`) de la API. |
| Documentos y versiones | `GET/POST /api/documents`, `GET /api/documents/{id}`, `GET /api/documents/{id}/download` | No existe aún `POST /api/documents/{id}/versions` para subir nuevas versiones sobre un documento existente. |
| Procesamiento y revisión humana | `PATCH /api/documents/{id}/fields/{fieldId}`, `POST /api/documents/{id}/approve`, `POST /api/documents/{id}/reject` | Muestra campos extraídos, confianza, sensibilidad financiera, incidencias de validación, errores (`lastError`) y notas de revisión. |
| Auditoría | `GET /api/audit-logs` | Restringido a roles `Admin` y `Owner`; soporta paginación y filtro exacto por `action`. |

---

## 5. Variables de Entorno y Ejecución Local

Archivo `frontend/.env.example`:

```env
VITE_API_BASE_URL=http://localhost:5000
```

Comandos dentro de Ubuntu WSL2 (`frontend/`):

```bash
npm install
npm run dev         # Servidor Vite en http://localhost:5173
npm run typecheck   # Verificación estricta de TypeScript
npm run lint        # ESLint
npm test            # Suite Vitest + React Testing Library
npm run build       # Compilación de producción (dist/)
```

Para probar end-to-end contra el backend real:
1. Levantar SQL Server y Azurite: `docker compose up -d`
2. Ejecutar API y Worker desde `backend/`: `dotnet run --project src/DocuFlow.API` y `dotnet run --project src/DocuFlow.Worker`
3. Asegurar que `FRONTEND_ORIGIN=http://localhost:5173` (ya configurado por defecto en `Cors:AllowedOrigins` del backend).
4. Ejecutar `npm run dev` en `frontend/`.

