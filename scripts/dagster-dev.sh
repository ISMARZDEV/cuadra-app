#!/usr/bin/env bash
# Dagster dev AISLADO — para tener la UI de ingesta arriba sin interferir con el backend/web.
#
# Por qué este script (y no `dagster dev` a secas):
#  - DAGSTER_HOME fuera del repo → no crea `.tmp_dagster_home_*` en apps/api (limpio, sin tocar el
#    file-watch de uvicorn) y CONSERVA el historial de corridas entre reinicios.
#  - Cascada de matching activada + canasta ACOTADA por default → las materializaciones son livianas
#    (cargar el modelo BGE-M3/torch es lo pesado; menos queries = menos presión de CPU/RAM).
#  - Puerto 3070 (web=3006, api=8005, metro=8087 quedan libres).
#
# Uso:
#   ./scripts/dagster-dev.sh                 # UI en http://localhost:3070, límite 30 queries
#   SAVE_REFRESH_QUERY_LIMIT=10 ./scripts/dagster-dev.sh   # runs aún más livianos
#
# La UI PRENDIDA no rompe nada (es liviana). Lo pesado es MATERIALIZAR: hacelo de a UNA fuente y
# acotado. Si la API llegara a ponerse lenta durante un run, reiniciala (dev-up ya la auto-recupera).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export DAGSTER_HOME="${DAGSTER_HOME:-$HOME/.cuadra-dagster}"
mkdir -p "$DAGSTER_HOME"

export SAVE_MATCHING_CASCADE_ENABLED="${SAVE_MATCHING_CASCADE_ENABLED:-true}"
export SAVE_REFRESH_QUERY_LIMIT="${SAVE_REFRESH_QUERY_LIMIT:-10}"

# --- Storage de instancia en Postgres (no el SQLite por defecto) ----------------------------------
# SQLite no soporta acceso concurrente → dos procesos Dagster sobre el mismo DAGSTER_HOME se traban
# por lock. Rol/db `dagster` DEDICADOS dentro de cuadra-db (aislados del secreto de la app).
export DAGSTER_PG_HOST="${DAGSTER_PG_HOST:-127.0.0.1}"
export DAGSTER_PG_PORT="${DAGSTER_PG_PORT:-5433}"
export DAGSTER_PG_USER="${DAGSTER_PG_USER:-dagster}"
export DAGSTER_PG_PASSWORD="${DAGSTER_PG_PASSWORD:-dagster}"
export DAGSTER_PG_DB="${DAGSTER_PG_DB:-dagster}"

if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^cuadra-db$'; then
  docker exec cuadra-db psql -U cuadra -d cuadra -tc \
    "SELECT 1 FROM pg_roles WHERE rolname='${DAGSTER_PG_USER}'" | grep -q 1 \
    || docker exec cuadra-db psql -U cuadra -d cuadra -c \
       "CREATE ROLE ${DAGSTER_PG_USER} LOGIN PASSWORD '${DAGSTER_PG_PASSWORD}'"
  docker exec cuadra-db psql -U cuadra -d cuadra -tc \
    "SELECT 1 FROM pg_database WHERE datname='${DAGSTER_PG_DB}'" | grep -q 1 \
    || docker exec cuadra-db psql -U cuadra -d cuadra -c \
       "CREATE DATABASE ${DAGSTER_PG_DB} OWNER ${DAGSTER_PG_USER}"
else
  echo "⚠ contenedor cuadra-db no está arriba — Dagster no podrá conectar su storage Postgres"
fi
# Dagster lee la config de instancia de DAGSTER_HOME, no del repo → copiamos la plantilla ahí.
# El template vive en scripts/ (NO en apps/api, que es el CWD de `dagster dev` → dispararía el warning
# "dagster.yaml in the current folder will not be used").
cp "$ROOT/scripts/dagster.yaml" "$DAGSTER_HOME/dagster.yaml"

echo "▶ Dagster UI  → http://localhost:3070"
echo "  DAGSTER_HOME=$DAGSTER_HOME  ·  storage=postgres(${DAGSTER_PG_DB})  ·  cascada=$SAVE_MATCHING_CASCADE_ENABLED  ·  límite=$SAVE_REFRESH_QUERY_LIMIT queries"
echo "  (storage Postgres = seguro correr un one-off mientras la UI está arriba)"

cd "$ROOT/apps/api"
exec uv run --group ingestion dagster dev -m ingestion.definitions -p 3070
