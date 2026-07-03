#!/usr/bin/env bash
# dev-down.sh — Tumba TODO el entorno de dev de Cuadra: Metro (:8082), API (:8005) y Postgres.
#
#   Uso:  ./scripts/dev-down.sh          (o doble clic en dev-down.command / Atajo de Siri)
#
# NO usa `set -e`: los `kill` devuelven ≠0 si el proceso ya no está, y eso NO es un error acá.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT=8005
METRO_PORT=8082

echo "▶ Cerrando Metro (:${METRO_PORT}) y API (:${API_PORT})…"
for port in "${METRO_PORT}" "${API_PORT}"; do
  pids="$(lsof -nP -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "${pids}" ]; then
    echo "  puerto ${port} → kill ${pids}"
    echo "${pids}" | xargs kill 2>/dev/null || true
  else
    echo "  puerto ${port} ya libre"
  fi
done

echo "▶ Bajando Postgres (make db-down)…"
if make -C "${ROOT}" db-down >/dev/null 2>&1; then
  echo "  ✓ Postgres detenido"
else
  echo "  (Postgres ya estaba abajo)"
fi

echo "✓ Entorno de dev tumbado."
