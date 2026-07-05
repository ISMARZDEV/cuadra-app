#!/usr/bin/env bash
# dev-up.sh — Levanta TODO el entorno de desarrollo de Cuadra de un comando,
# listo para correr en dispositivos Apple FÍSICOS (iPhone/iPad) en la misma red.
#
#   Postgres (Docker) → migraciones → API en 0.0.0.0:8005 → Metro apuntando a la IP de la Mac
#
# Uso:   ./scripts/dev-up.sh
# Parar: Ctrl+C (corta Metro y la API; Postgres queda corriendo, parar con `make db-down`)
#
# Requisitos: Docker corriendo, uv, node/pnpm, el dev-build ya instalado en el device
# (ver scripts/ios-device-build.sh y docs/running-on-apple-devices.md).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT=8005
METRO_PORT=8082

# En DEV queremos CORS abierto (`*`, el default de config.py). Si la shell trae un
# `CORS_ORIGINS` exportado a mano (p. ej. apuntando a un puerto viejo), el API nace
# con CORS restrictivo y el navegador se come un error de preflight. Lo normalizamos
# acá para que el script sea idempotente sin importar el estado de la terminal.
unset CORS_ORIGINS

# ── 1. IP LAN de la Mac (el iPhone/iPad NO puede usar localhost) ───────────────
# Usamos la interfaz de la RUTA POR DEFECTO (la misma que elige Metro) para que la URL de
# la API coincida con la del dev server, aun si hay varias interfaces (en0/en9/VPN/etc.).
DEF_IF="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')"
IP="$(ipconfig getifaddr "${DEF_IF:-en0}" 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
if [[ -z "${IP}" ]]; then
  echo "✖ No pude detectar la IP LAN. Conectate a una red Wi-Fi y reintentá." >&2
  exit 1
fi
echo "▶ IP LAN de la Mac: ${IP}"
echo "  El iPhone/iPad deben estar en la MISMA Wi-Fi."

# ── 2. Postgres (Docker) ───────────────────────────────────────────────────────
echo "▶ Levantando Postgres…"
make -C "${ROOT}" db-up >/dev/null
echo -n "  esperando que acepte conexiones"
for _ in $(seq 1 30); do
  if docker exec cuadra-db pg_isready -U cuadra >/dev/null 2>&1; then echo " ✓"; break; fi
  echo -n "."; sleep 1
done

# ── 3. Migraciones ─────────────────────────────────────────────────────────────
echo "▶ Migraciones (alembic upgrade head)…"
make -C "${ROOT}" migrate >/dev/null

# ── 4. API atada a 0.0.0.0 (alcanzable desde la LAN) ───────────────────────────
# Libera el puerto PRIMERO: un API viejo zombi en :${API_PORT} haría fallar el bind del nuevo
# ("address already in use") Y respondería el health de abajo, dejándonos servir desde el proceso
# viejo sin enterarnos (p. ej. con observabilidad apagada).
if lsof -nP -tiTCP:"${API_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "▶ Liberando el puerto ${API_PORT} (había un proceso previo)…"
  lsof -nP -tiTCP:"${API_PORT}" -sTCP:LISTEN | xargs kill 2>/dev/null || true
  sleep 1
fi

# `$$` = PID del script → nombre único por corrida y limpio, sin las rarezas de `mktemp` entre
# macOS (BSD, exige las X al final) y Linux (GNU).
API_LOG="${TMPDIR:-/tmp}/cuadra-api.$$.log"
echo "▶ API en http://${IP}:${API_PORT}  (logs: ${API_LOG})  [auto-reload en src/]"
# --reload: recarga el API al guardar código, sin reiniciar el script a mano.
# --reload-dir src: acota la vigilancia a src/ (evita .venv, __pycache__, seeds → recargas
# innecesarias y arranque lento). El worker que spawnea el reloader es nieto del script, pero
# el cleanup de abajo mata POR PUERTO, así que igual queda libre al salir.
( cd "${ROOT}/apps/api" && uv run uvicorn src.main:app --host 0.0.0.0 --port "${API_PORT}" --reload --reload-dir src ) >"${API_LOG}" 2>&1 &
API_PID=$!
# Al salir, mata el árbol y libera el puerto (kill al PID del subshell NO basta: uv/uvicorn son
# nietos y sobreviven → de ahí los zombis). Limpiar por puerto garantiza que quede libre.
cleanup() {
  echo; echo "▶ Cerrando API…"
  kill "${API_PID}" 2>/dev/null || true
  lsof -nP -tiTCP:"${API_PORT}" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo -n "  esperando health"
for _ in $(seq 1 30); do
  # Si NUESTRO proceso murió (p. ej. bind fallido), aborta con el log — NO te fíes del health,
  # que podría estar respondiéndolo otro proceso.
  if ! kill -0 "${API_PID}" 2>/dev/null; then
    echo " ✖"
    echo "✖ La API murió al arrancar. Últimas líneas del log:" >&2
    tail -n 20 "${API_LOG}" >&2
    exit 1
  fi
  if curl -fsS -m 2 "http://${IP}:${API_PORT}/v1/health" >/dev/null 2>&1; then echo " ✓"; break; fi
  echo -n "."; sleep 1
done

# ── 5. Metro apuntando a la IP de la Mac (EXPO_PUBLIC_* se inyecta en el bundle) ─
echo "▶ Metro en :${METRO_PORT} → API http://${IP}:${API_PORT}"
echo "  En el dev-client del device: conectá a  ${IP}:${METRO_PORT}  y logueá con cualquier email."
echo
cd "${ROOT}/apps/mobile"
# Pass extra args through to expo (e.g. `./scripts/dev-up.sh --clear` to reset Metro's cache,
# needed after installing a new native module / adding assets).
EXPO_PUBLIC_API_URL="http://${IP}:${API_PORT}" exec npx expo start --dev-client --port "${METRO_PORT}" "$@"
