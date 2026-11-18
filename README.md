# DocuFlow AI

DocuFlow AI es una plataforma SaaS B2B multitenant para la extracción, clasificación, validación y gestión segura de documentos comerciales (facturas, órdenes de compra, contratos, etc.) impulsada por IA.

---

## 🛠️ Requisitos Previos

* **Sistema Operativo:** Windows con WSL2 (Ubuntu 24.04 / 26.04 LTS).
* **Docker Engine & Docker Compose:** Activo dentro de Ubuntu WSL2.
* **.NET 10 SDK:** Instalado en el entorno Ubuntu WSL2.
* **Node.js (LTS):** Instalado en Ubuntu WSL2 mediante `nvm`.
* **Git:** Configurado en WSL2.

---

## 🚀 Guía de Puesta en Marcha del Entorno Local

Ejecuta los siguientes pasos desde la terminal de **Ubuntu (WSL2)**:

### 1. Inicializar Repositorio Git (si aún no está inicializado)
```bash
cd /home/crist_r5h2ajz/projects/DocuFlow
git init
git config user.name "Tu Nombre"
git config user.email "tu-email@ejemplo.com"
git add .
git commit -m "chore: initial project setup and infrastructure configuration"
```

### 2. Instalar .NET 10 SDK en Ubuntu WSL2
En Ubuntu 26.04 LTS, instala el paquete oficial desde los repositorios de Ubuntu:
```bash
sudo apt update
sudo apt install -y dotnet-sdk-10.0

# Verificar instalación:
dotnet --version
```

### 3. Instalar Node.js LTS (vía NVM) en Ubuntu WSL2
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc

# Instalar y fijar Node.js LTS por defecto:
nvm install --lts
nvm alias default 'lts/*'

# Verificar instalación:
node -v
npm -v
```

### 4. Configurar Variables de Entorno Locales
Copia el archivo de variables de ejemplo:
```bash
cp .env.example .env
```

### 5. Levantar Servicios de Infraestructura con Docker Compose
Inicia PostgreSQL 17 (base de datos y cola de procesamiento) y almacenamiento privado local en volumen Docker:
```bash
docker compose up -d postgres
```

O levanta todo el stack backend (`postgres`, `api` y `worker`):
```bash
docker compose up -d --build
```

Verifica el estado de los contenedores:
```bash
docker compose ps
```

* **PostgreSQL:** `localhost:5432` (Base de datos: `docuflow`, credenciales definidas en `.env`)
* **Almacenamiento documental:** volumen Docker privado `docuflow_document_storage` (`/data/storage` en contenedores, o carpeta local de aplicación cuando se ejecuta fuera de Docker)

> Consulta [docs/postgresql-migration.md](docs/postgresql-migration.md) para más detalles sobre la configuración, migraciones de EF Core, respaldos y persistencia en PostgreSQL.

### 6. Ejecutar Backend (.NET 10)
```bash
cd backend
dotnet restore
dotnet test DocuFlow.sln
dotnet run --project src/DocuFlow.API
```

En otra terminal, inicia el Worker de procesamiento asíncrono:
```bash
cd backend
dotnet run --project src/DocuFlow.Worker
```

### 7. Ejecutar Frontend (React + Vite)
```bash
cd frontend
cp .env.example .env
npm install
npm test
npm run dev
```

* **Frontend:** `http://localhost:5173`
* **API:** `http://localhost:5000` (configurable con `VITE_API_BASE_URL` en `frontend/.env`)

---

## 📂 Estructura del Proyecto

```text
DocuFlow/
├── .env.example             # Plantilla de variables de entorno locales
├── .gitignore               # Reglas de exclusión de Git para .NET, Node y Docker
├── docker-compose.yml       # Infraestructura local (PostgreSQL 17 + API + Worker)
├── AGENTS.md                # Directivas técnicas y arquitectura del proyecto
├── README.md                # Guía de configuración y documentación
├── docs/                    # Documentación técnica (arquitectura y auditoría)
├── backend/                 # Arquitectura Modular Monolith en .NET 10
│   ├── src/
│   │   ├── DocuFlow.Domain/
│   │   ├── DocuFlow.Application/
│   │   ├── DocuFlow.Infrastructure/
│   │   ├── DocuFlow.API/
│   │   └── DocuFlow.Worker/
│   └── tests/
└── frontend/                # SPA React + TypeScript + Vite + Tailwind CSS
    ├── src/
    └── tests/
```

