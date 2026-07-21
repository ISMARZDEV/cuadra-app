#!/usr/bin/env bash
# dagster-down.sh — Apaga el ÁRBOL de Dagster de ESTE repo (UI :3070 + daemon + code-server) sin
# tocar el backend/web.
#
# `dagster dev` levanta un árbol: wrapper `uv run` → `dagster dev` → webserver + daemon + code-server
# (+ su `dagster api grpc`). Matar solo el puerto deja huérfanos al daemon y al code-server, y ESO es
# lo que después rompe las corridas con "Another daemon is still sending heartbeats… multiple daemon
# processes not supported" — un fallo que aparece mucho más tarde y no se parece a su causa.
#
# Historia de dos bugs que este script TENÍA (corregidos 2026-07-20), porque son instructivos:
#
#   1. El patrón era `dagster.daemon` y el proceso real es `dagster._daemon`. El `.` del regex se
#      come el punto literal, y luego `daemon` no puede matchear `_daemon`: fallaba por UN carácter
#      y NUNCA mató al daemon. Ahora los patrones son literales (`grep -F`).
#   2. Verificaba el PUERTO 3070 y no el ÁRBOL. Como el webserver sí moría, el puerto quedaba libre
#      y el script imprimía "✓ Dagster apagado" con 5 procesos vivos. El ✓ no era evidencia.
#
# Regla que hereda: **no se declara éxito sin verificar el estado final.**
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$REPO_ROOT/apps/api"

# Patrones LITERALES (se buscan con `grep -F`, sin regex: ver bug 1). Acotados a este repo donde la
# ruta aparece en la línea de comando, para no tocar otro checkout ni otro proyecto de la máquina.
PATTERNS=(
  "$API_DIR/.venv/bin/dagster"   # el proceso padre `dagster dev`
  "dagster_webserver"            # la UI :3070
  "dagster._daemon"              # el daemon (schedules/sensores) ← el que se escapaba
  "dagster code-server"          # el code-server que carga las definitions
  "dagster api grpc"             # el grpc del code location
  "uv run --group ingestion"     # el wrapper que lanza dagster-dev.sh
)

# PIDs vivos del árbol, excluyendo este propio script (y cualquier `dagster-down` en vuelo).
tree_pids() {
  local out="" pid cmd
  while read -r pid cmd; do
    [ -z "${pid:-}" ] && continue
    [ "$pid" = "$$" ] && continue
    case "$cmd" in *dagster-down.sh*) continue ;; esac
    for p in "${PATTERNS[@]}"; do
      if printf '%s' "$cmd" | grep -qF -- "$p"; then
        out="$out $pid"
        break
      fi
    done
  done < <(ps -Ao pid=,command= 2>/dev/null)
  printf '%s' "${out# }"
}

echo "▶ Apagando Dagster (árbol completo de $REPO_ROOT)…"

pids="$(tree_pids)"
if [ -z "$pids" ] && [ -z "$(lsof -ti tcp:3070 2>/dev/null || true)" ]; then
  echo "✓ Dagster no estaba corriendo (nada que apagar)."
  exit 0
fi

# 1) TERM al árbol + a quien ocupe el puerto (por si algo escucha sin matchear los patrones).
port_pids="$(lsof -ti tcp:3070 2>/dev/null || true)"
[ -n "$pids" ] && echo "  · árbol → PIDs:$( echo " $pids")"
[ -n "$port_pids" ] && echo "  · puerto 3070 → PIDs: $(echo "$port_pids" | tr '\n' ' ')"
# shellcheck disable=SC2086
kill $pids $port_pids 2>/dev/null || true

# 2) Gracia para que bajen ordenados (el daemon cierra su heartbeat al salir limpio).
for _ in 1 2 3 4 5 6; do
  [ -z "$(tree_pids)" ] && break
  sleep 0.5
done

# 3) Lo que siga vivo, a la fuerza.
pids="$(tree_pids)"
if [ -n "$pids" ]; then
  echo "  · resisten → kill -9:$(echo " $pids")"
  # shellcheck disable=SC2086
  kill -9 $pids 2>/dev/null || true
  sleep 1
fi

# 4) VERIFICAR antes de declarar nada — el bug 2 de arriba.
pids="$(tree_pids)"
port_pids="$(lsof -ti tcp:3070 2>/dev/null || true)"
if [ -n "$pids" ] || [ -n "$port_pids" ]; then
  echo "✗ Dagster NO quedó limpio."
  [ -n "$pids" ] && ps -o pid=,command= -p $pids 2>/dev/null | sed 's/^/    /'
  [ -n "$port_pids" ] && echo "    puerto 3070 ocupado por: $(echo "$port_pids" | tr '\n' ' ')"
  echo "  Relanzar dagster-dev.sh en este estado da 'multiple daemon processes not supported'."
  exit 1
fi

echo "✓ Dagster apagado (árbol vacío, puerto 3070 libre)."
