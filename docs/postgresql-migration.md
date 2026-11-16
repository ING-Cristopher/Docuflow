# Migración de DocuFlow AI a PostgreSQL en Docker

Este documento describe la migración de la base de datos principal de **DocuFlow AI** desde SQL Server hacia **PostgreSQL 17** ejecutándose en Docker, manteniendo la arquitectura Modular Monolith de .NET 10 y el aislamiento multi-tenant.

---

## 1. Cambios realizados

1. **Docker Compose (`docker-compose.yml`):**
   - Se incorporó el servicio `postgres` usando la imagen oficial `postgres:17.2-alpine`.
   - Contenedor: `docuflow-postgres`, base de datos: `docuflow`, puerto: `5432`, política de reinicio: `unless-stopped`.
   - Volumen persistente `docuflow_postgres_data` montado en `/var/lib/postgresql/data`.
   - Healthcheck con `pg_isready`.
   - El servicio `sqlserver` previo se conserva temporalmente sin eliminar su volumen (`docuflow_sqlserver_data`) para resguardo durante la transición.

2. **Variables de entorno (`.env.example`):**
   - Se agregaron `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` y `POSTGRES_CONNECTION_STRING` sin credenciales reales en el repositorio.

3. **Entity Framework Core y Npgsql (`DocuFlow.Infrastructure`):**
   - Se instaló `Npgsql.EntityFrameworkCore.PostgreSQL` `10.0.3` (junto con `Npgsql` `10.0.3`), compatible con .NET 10 y EF Core `10.0.4`.
   - `DependencyInjection.cs` y `DesignTimeDbContextFactory.cs` ahora usan `UseNpgsql(...)` leyendo `ConnectionStrings:DefaultConnection` o `POSTGRES_CONNECTION_STRING`.
   - `DocuFlowDbContext.cs` configura el control de concurrencia optimista para PostgreSQL mediante la columna del sistema `xmin` (`IsRowVersion()` sobre shadow property `uint`) en `Document` y `ExtractedField`, manteniendo intacto el comportamiento con SQLite para pruebas en memoria.

4. **Estrategia de migraciones:**
   - Las migraciones previas de SQL Server (`InitialCreate`, `AddOutboxAndConcurrencyTokens` y su snapshot) se conservaron intactas en `backend/src/DocuFlow.Infrastructure/Persistence/Migrations/SqlServer/` y se excluyeron de compilación en `DocuFlow.Infrastructure.csproj` para evitar mezclar historiales de proveedores distintos.
   - Se generó un historial limpio e independiente para PostgreSQL en `backend/src/DocuFlow.Infrastructure/Persistence/Migrations/PostgreSql/` (`20261116010047_InitialPostgreSql`).

---

## 2. Configuración de PostgreSQL

Variables requeridas en `.env` (basado en `.env.example`):

```env
POSTGRES_DB=docuflow
POSTGRES_USER=docuflow
POSTGRES_PASSWORD=TU_PASSWORD_SEGURO
POSTGRES_PORT=5432
POSTGRES_CONNECTION_STRING=Host=localhost;Port=5432;Database=docuflow;Username=docuflow;Password=TU_PASSWORD_SEGURO
```

---

## 3. Cómo iniciar y detener el contenedor

Iniciar PostgreSQL (y Azurite):

```bash
docker compose up -d postgres azurite
```

Verificar estado y healthcheck:

```bash
docker compose ps
```

Detener PostgreSQL (sin eliminar datos):

```bash
docker compose stop postgres
```

---

## 4. Cómo aplicar migraciones

Al arrancar `DocuFlow.API` en desarrollo o pruebas relacionales, `Program.cs` ejecuta `await db.Database.MigrateAsync()` automáticamente.

Para aplicar o crear migraciones manualmente desde `backend/`:

```bash
export POSTGRES_CONNECTION_STRING=$(grep "^POSTGRES_CONNECTION_STRING=" ../.env | cut -d= -f2-)

# Aplicar migraciones pendientes
dotnet ef database update --project src/DocuFlow.Infrastructure --startup-project src/DocuFlow.API

# Crear una nueva migración de PostgreSQL
dotnet ef migrations add NombreDeMigracion \
  --project src/DocuFlow.Infrastructure \
  --startup-project src/DocuFlow.API \
  --output-dir Persistence/Migrations/PostgreSql
```

---

## 5. Cómo respaldar y restaurar la base de datos

### Respaldo lógico (`pg_dump`)

```bash
docker exec -t docuflow-postgres pg_dump -U docuflow -d docuflow -F c -f /tmp/docuflow_backup.dump
docker cp docuflow-postgres:/tmp/docuflow_backup.dump ./docuflow_backup.dump
```

O en formato SQL plano:

```bash
docker exec -t docuflow-postgres pg_dump -U docuflow -d docuflow > docuflow_backup.sql
```

### Restauración (`pg_restore` / `psql`)

```bash
docker cp ./docuflow_backup.dump docuflow-postgres:/tmp/docuflow_backup.dump
docker exec -t docuflow-postgres pg_restore -U docuflow -d docuflow --clean --if-exists /tmp/docuflow_backup.dump
```

---

## 6. Cómo verificar la persistencia

1. Confirmar que el volumen `docuflow_postgres_data` existe:
   ```bash
   docker volume ls | grep docuflow_postgres_data
   ```
2. Insertar o consultar registros y reiniciar el contenedor:
   ```bash
   docker compose restart postgres
   ```
3. Verificar que los conteos se mantienen tras el reinicio:
   ```bash
   docker exec docuflow-postgres psql -U docuflow -d docuflow -c 'SELECT count(*) FROM "Organizations";'
   ```

---

## 7. Limitaciones e incompatibilidades encontradas y resueltas

- **`RowVersion` (`byte[]` + `.IsRowVersion()`):** En SQL Server `rowversion` es un tipo binario autogenerado; en PostgreSQL `bytea` no se autogenera. Se resolvió configurando en `DocuFlowDbContext` la columna del sistema `xmin` (`uint`) como token de concurrencia optimista para Npgsql, manteniendo `RowVersion` como `ValueGeneratedNever()` para preservar la compatibilidad del dominio y las pruebas en SQLite.
- **Migraciones por proveedor:** No se deben mezclar migraciones de SQL Server y PostgreSQL bajo el mismo historial de compilación de EF Core. Por ello se separaron en `Migrations/SqlServer/` (archivadas) y `Migrations/PostgreSql/` (activas).
- **Nota sobre `DbInitializer.SeedAsync()`:** El seed inicial (`docuflow-demo` / `admin@docuflow.local`) solo se ejecuta cuando la tabla `Organizations` está vacía. Si antes de arrancar la API por primera vez se ejecutan pruebas que insertan organizaciones en la base de datos real, el seed automático se omitirá.

