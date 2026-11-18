# DocuFlow AI

DocuFlow AI es una plataforma SaaS B2B multi-tenant para la ingesta segura, clasificación, extracción inteligente, resumen ejecutivo, revisión humana y auditoría de documentos comerciales (facturas, órdenes de compra, contratos, recibos, PDFs e imágenes) impulsada por **Google Gemini**, **.NET 10**, **PostgreSQL 17** y **React + TypeScript**.

---

## Características Principales

- **Arquitectura Modular Monolith y Clean Architecture (.NET 10):** separación clara entre `Domain`, `Application`, `Infrastructure`, `API` y `Worker` asíncrono.
- **Seguridad Multi-Tenant Estricta y RBAC:** aislamiento *fail-closed* mediante filtros globales de Entity Framework Core vinculados al claim `org_id` del JWT (`Viewer`, `Reviewer`, `Operator`, `Admin`, `Owner`), validación de membresía activa en tiempo real y cabeceras HTTP de seguridad (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`).
- **Persistencia, Cola Transaccional y Almacenamiento Privado:**
  - **PostgreSQL 17** como base de datos principal con concurrencia optimista (`xmin`) y migraciones automáticas en arranque.
  - **Cola durable `DocumentQueueMessages`** con `FOR UPDATE SKIP LOCKED` para procesamiento asíncrono recuperable e idempotente en `DocuFlow.Worker`.
  - **Almacenamiento privado en sistema de archivos / volumen Docker** con validación de firma binaria (*magic bytes*), hash SHA-256, límites de tamaño, protección contra *path traversal* y descarga exclusivamente mediante streaming autorizado.
- **Procesamiento Multimodal y Asistente con Google Gemini:**
  - Extracción estructurada de campos con puntaje de confianza, detección automática de incidencias de validación y **resumen ejecutivo en español** por documento.
  - Asistente conversacional de IA (`POST /api/agent/chat`) con *rate limiting* por usuario, resiliencia HTTP (reintentos + circuit breaker) y acceso acotado al tenant autenticado.
- **Frontend SPA Responsivo (React 18 + TypeScript + Tailwind CSS):** adaptado a pantallas móviles, tablets, portátiles y monitores panorámicos, con validación mediante Zod + React Hook Form y gestión de caché/estado con TanStack Query.

---

## Despliegue en Producción (Docker Compose)

La configuración incluida empaqueta todo el stack (`postgres`, `api`, `worker` y `frontend` con Nginx como servidor de archivos estáticos y *reverse proxy* hacia `/api` y `/health`) listo para producción sin cuentas ni datos de demostración pre-cargados.

### 1. Requisitos previos
- **Docker Engine** y **Docker Compose v2**
- Una clave válida de **Google Gemini API** (opcional para arrancar, necesaria para extracción y resumen real con IA; sin clave configurada, el extractor determinista local queda como respaldo explícito)

### 2. Configurar variables de entorno
```bash
cp .env.example .env
```

Edita `.env` (archivo excluido de Git) y define valores seguros para producción:
- `POSTGRES_PASSWORD`: contraseña segura para PostgreSQL.
- `JWT_SECRET_KEY`: secreto aleatorio de al menos **32 caracteres** (recomendado: 48+ caracteres; obligatorio fuera de `Development`).
- `GEMINI_API_KEY`: clave de API de Google Gemini.
- `ASPNETCORE_ENVIRONMENT=Production`
- `FRONTEND_PORT=8080` y `FRONTEND_ORIGIN=https://tu-dominio.com` (o `http://localhost:8080` en despliegue local con Docker).

### 3. Construir y levantar el stack completo
```bash
docker compose up -d --build
```

Verifica el estado de los contenedores:
```bash
docker compose ps
```

- **Aplicación web (Nginx + SPA + proxy `/api`):** `http://localhost:8080` (o el puerto definido en `FRONTEND_PORT`)
- **Healthcheck de API:** `http://localhost:8080/health` (y puerto interno/mapeado `5000`)

Al acceder por primera vez en producción, la base de datos se crea limpia mediante migraciones de EF Core y sin usuarios de demostración. Utiliza `/register` para crear la primera organización y su usuario `Owner`.

---

## Desarrollo Local y Pruebas Automatizadas

### Requisitos para desarrollo local
- **.NET 10 SDK**
- **Node.js LTS** y `npm`
- **PostgreSQL 17** (por ejemplo, `docker compose up -d postgres`)

### Backend (.NET 10)
```bash
cd backend
dotnet restore DocuFlow.sln
dotnet build DocuFlow.sln
dotnet test DocuFlow.sln
```

Para ejecutar también la prueba de integración real contra Docker PostgreSQL:
```bash
DOCUFLOW_RUN_DOCKER_TESTS=true dotnet test DocuFlow.sln
```

Para iniciar API y Worker localmente en modo desarrollo:
```bash
cd backend
dotnet run --project src/DocuFlow.API
# En otra terminal:
dotnet run --project src/DocuFlow.Worker
```

> Nota: `DbInitializer.SeedAsync()` está desactivado por defecto. Si en algún momento necesitas sembrar datos demo locales exclusivamente en `Development`, ejecuta la API con `SEED_DEMO_DATA=true`.

### Frontend (React + Vite + Vitest)
```bash
cd frontend
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run dev
```

---

## Estructura del Proyecto

```text
DocuFlow/
├── .env.example                  # Plantilla de variables de entorno (sin secretos)
├── .gitignore                    # Reglas de exclusión (.env, dist, bin, obj, test-results)
├── docker-compose.yml            # Orquestación de producción: postgres + api + worker + frontend
├── AGENTS.md                     # Directivas técnicas de ingeniería del proyecto
├── README.md                     # Documentación principal y guía de despliegue
├── docs/                         # Arquitectura, auditoría y migración a PostgreSQL
├── backend/
│   ├── Dockerfile                # Build multi-etapa .NET 10 (targets: api y worker)
│   ├── src/
│   │   ├── DocuFlow.Domain/
│   │   ├── DocuFlow.Application/
│   │   ├── DocuFlow.Infrastructure/
│   │   ├── DocuFlow.API/
│   │   └── DocuFlow.Worker/
│   └── tests/
│       ├── DocuFlow.UnitTests/
│       └── DocuFlow.IntegrationTests/
└── frontend/
    ├── Dockerfile                # Build multi-etapa Node 22 + Nginx 1.27 Alpine
    ├── nginx.conf                # Enrutamiento SPA + cabeceras de seguridad + proxy /api y /health
    ├── src/
    └── tests/
```
