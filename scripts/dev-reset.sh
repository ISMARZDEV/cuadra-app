#!/usr/bin/env bash
# dev-reset.sh — Reset NO destructivo: cierra Metro/API y re-levanta con la caché del bundler
# limpia (`expo start --clear`). La base de datos NO se toca (los datos quedan intactos).
#
# Útil cuando Metro se traba, el bundle queda raro, o agregaste assets / módulos nativos y Metro
# no los ve. Para un reset de DATOS (borrar la DB) NO es esto — eso sería otro script destructivo.
#
#   Uso:  ./scripts/dev-reset.sh   (o doble clic en dev-reset.command / Atajo de Siri)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
METRO_PORT=8082

echo "▶ Reset de caché de Metro (la DB queda intacta)."
echo "▶ Cerrando Metro previo (:${METRO_PORT})…"
pids="$(lsof -nP -tiTCP:"${METRO_PORT}" -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "${pids}" ]; then
  echo "  kill ${pids}"
  echo "${pids}" | xargs kill 2>/dev/null || true
  sleep 1
else
  echo "  ya libre"
fi

# dev-up.sh se encarga del resto (Postgres idempotente, migraciones, libera :8005, arranca API y
# Metro). El `--clear` viaja hasta `expo start` y limpia la caché del bundler.
echo "▶ Re-levantando con caché limpia (dev-up.sh --clear)…"
exec "${ROOT}/scripts/dev-up.sh" --clear
