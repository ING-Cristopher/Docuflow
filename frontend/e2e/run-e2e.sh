#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  source "$HOME/.nvm/nvm.sh"
fi

if [ -f "$ROOT_DIR/.env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      ""|\#*) continue ;;
    esac
    key="${line%%=*}"
    val="${line#*=}"
    export "$key=$val"
  done < "$ROOT_DIR/.env"
fi

export ASPNETCORE_ENVIRONMENT=Development
export FRONTEND_ORIGIN=http://localhost:5174
export VITE_API_BASE_URL=http://localhost:5029
export E2E_API_URL=http://localhost:5029
export E2E_FRONTEND_URL=http://localhost:5174

echo "Building backend..."
cd "$ROOT_DIR/backend"
/usr/bin/dotnet build DocuFlow.sln --no-restore -c Debug

echo "Starting DocuFlow.API and DocuFlow.Worker..."
/usr/bin/dotnet run --no-build --project src/DocuFlow.API --urls http://localhost:5029 > /tmp/docuflow-api.log 2>&1 &
API_PID=$!
/usr/bin/dotnet run --no-build --project src/DocuFlow.Worker > /tmp/docuflow-worker.log 2>&1 &
WORKER_PID=$!

echo "Starting Vite frontend..."
cd "$ROOT_DIR/frontend"
npm run dev -- --port 5174 > /tmp/docuflow-web.log 2>&1 &
WEB_PID=$!

cleanup() {
  kill "$API_PID" "$WORKER_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "Waiting for API /health and Frontend..."
READY=0
for _ in $(seq 1 45); do
  if curl -fsS http://localhost:5029/health >/dev/null 2>&1 && curl -fsS http://localhost:5174 >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "Services failed to become ready."
  echo "--- API LOG ---"
  cat /tmp/docuflow-api.log || true
  echo "--- WORKER LOG ---"
  cat /tmp/docuflow-worker.log || true
  echo "--- WEB LOG ---"
  cat /tmp/docuflow-web.log || true
  exit 1
fi

curl -fsS http://localhost:5029/health
echo ""

npx playwright test

