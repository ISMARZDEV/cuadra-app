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

echo "▶ Dagster UI  → http://localhost:3070"
echo "  DAGSTER_HOME=$DAGSTER_HOME  ·  cascada=$SAVE_MATCHING_CASCADE_ENABLED  ·  límite=$SAVE_REFRESH_QUERY_LIMIT queries"
echo "  (UI prendida = seguro; materializá de a una fuente y acotado)"

cd "$ROOT/apps/api"
exec uv run --group ingestion dagster dev -m ingestion.definitions -p 3070
