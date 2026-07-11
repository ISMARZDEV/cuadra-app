#!/usr/bin/env bash
# Red de seguridad (nivel 2): reinicia SOLO la API dev (uvicorn :8005).
#
# Cuándo: si un run pesado de ingesta (Dagster materializando *_prices) ahogó la API y quedó lenta
# o sin responder. La API dev es un proceso único; bajo presión de RAM/CPU se puede trabar. Esto la
# mata y la relanza limpia en segundos, sin tocar web/postgres.
#
# Corré esto EN TU PROPIA TERMINAL → la API queda bajo tu control (persistente), no atada a otra sesión.
#   ./scripts/api-restart.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${API_PORT:-8005}"

echo "⏹  matando API en :$PORT ..."
lsof -ti "tcp:$PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
pkill -9 -f "uvicorn src.main:app" 2>/dev/null || true
sleep 1

echo "▶  relanzando API en http://localhost:$PORT  (auto-reload en src/)"
cd "$ROOT/apps/api"
exec uv run uvicorn src.main:app --host 0.0.0.0 --port "$PORT" --reload --reload-dir src
