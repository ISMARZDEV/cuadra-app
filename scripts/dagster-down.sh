#!/usr/bin/env bash
# dagster-down.sh — Apaga la UI de ingesta de Dagster (puerto 3070) sin tocar el backend/web.
#
# `dagster dev` levanta un ÁRBOL de procesos (webserver + daemon + code-server), así que matar solo el
# puerto 3070 deja huérfanos al daemon/code-server. Matamos por puerto Y por patrón para dejarlo limpio.
set -euo pipefail

echo "▶ Apagando Dagster (UI de ingesta, puerto 3070)…"

killed=0

# 1) Lo que escuche en 3070 (el webserver).
pids="$(lsof -ti tcp:3070 2>/dev/null || true)"
if [ -n "$pids" ]; then
  echo "  · puerto 3070 → PIDs: $pids"
  kill $pids 2>/dev/null || true
  killed=1
fi

# 2) El resto del árbol: daemon, code-server y el proceso `dagster dev` de este repo.
#    -f matchea la línea de comando completa; acotado a `dagster` para no tocar nada más.
if pkill -f 'dagster dev' 2>/dev/null; then killed=1; fi
if pkill -f 'dagster.daemon' 2>/dev/null; then killed=1; fi
if pkill -f 'dagster api grpc' 2>/dev/null; then killed=1; fi

# 3) Gracia breve; si algo sigue en 3070, forzar.
sleep 1
pids="$(lsof -ti tcp:3070 2>/dev/null || true)"
if [ -n "$pids" ]; then
  echo "  · aún vivo en 3070 → kill -9 $pids"
  kill -9 $pids 2>/dev/null || true
  killed=1
fi

if [ "$killed" -eq 1 ]; then
  echo "✓ Dagster apagado."
else
  echo "✓ Dagster no estaba corriendo (nada que apagar)."
fi
