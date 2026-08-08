#!/usr/bin/env bash
# sim-up.sh — Corre la app de Cuadra en el SIMULADOR de iOS con el DEV-CLIENT.
#
# A diferencia de dev-up.sh / dev-sim.sh (que además levantan Postgres + API + Web), este script
# es el camino LIVIANO: asume que el backend ya está corriendo y solo se ocupa de la app.
#
#   bootear simulador → asegurar el dev-client instalado (compilar si falta) → expo start --dev-client
#
# El simulador comparte la red de la Mac, así que `localhost` alcanza la API local — no hace falta
# detectar IP de LAN.
#
# ⚠️ POR QUÉ NO EXPO GO (esto ya nos costó una sesión):
#   Hasta el 2026-07-03 este script usaba `expo start --go`. El 2026-07-05 entró `@clerk/expo`
#   (commit 6fcd2e5) y con él un ViewManager NATIVO; después llegaron Skia y Reanimated.
#   Expo Go es un binario GENÉRICO de Expo: no puede cargar módulos nativos que agregaste vos.
#   Con `--go` la app revienta con `Unimplemented component: <ViewManagerAdapter_ClerkAuthView>`.
#   El dev-client es TU binario compilado — mismo fast-refresh, pero con los nativos adentro.
#   No vuelvas a poner `--go` acá.
#
# Uso:  ./scripts/sim-up.sh                 # simulador ya booteado, o el iPhone más nuevo
#       ./scripts/sim-up.sh "iPhone 17"     # forzar un device por nombre
#       ./scripts/sim-up.sh --rebuild       # recompilar el dev-client (tras tocar código nativo)
#       ./scripts/sim-up.sh --clear         # cualquier otro flag se pasa tal cual a `expo start`
#
# Requisitos: Xcode + simuladores instalados, node/pnpm. El dev-client se compila solo si falta.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Registro FIJO de puertos del repo (mismo valor que dev-up.sh; env-doctor.sh lo audita).
METRO_PORT="${METRO_PORT:-8087}"

# El bundle id se LEE de app.json — si algún día cambia, este script no queda mintiendo.
APP_ID="$(node -p "JSON.parse(require('fs').readFileSync('${ROOT}/apps/mobile/app.json','utf8')).expo.ios.bundleIdentifier")"

# ── 0. Flags propios ───────────────────────────────────────────────────────────
# Si el primer argumento NO empieza con "-", se trata como nombre de device a botear.
DEVICE_NAME=""
if [[ "${1:-}" != "" && "${1:0:1}" != "-" ]]; then
  DEVICE_NAME="$1"; shift
fi

# `--rebuild` es NUESTRO, no de expo: lo sacamos de "$@" antes de reenviar el resto.
FORCE_REBUILD=0
REST=()
for arg in "$@"; do
  if [[ "${arg}" == "--rebuild" ]]; then FORCE_REBUILD=1; else REST+=("${arg}"); fi
done
set -- "${REST[@]+"${REST[@]}"}"

# ── 1. Asegurar un simulador booteado ──────────────────────────────────────────
BOOTED_UDID="$(xcrun simctl list devices booted 2>/dev/null | grep -Eo '[0-9A-F-]{36}' | head -1 || true)"

if [[ -z "${BOOTED_UDID}" || -n "${DEVICE_NAME}" ]]; then
  if [[ -n "${DEVICE_NAME}" ]]; then
    TARGET_UDID="$(xcrun simctl list devices available | grep -F "${DEVICE_NAME} (" | grep -Eo '[0-9A-F-]{36}' | head -1 || true)"
    [[ -z "${TARGET_UDID}" ]] && { echo "✖ No encontré un simulador llamado '${DEVICE_NAME}'." >&2; exit 1; }
  else
    TARGET_UDID="$(xcrun simctl list devices available | grep -E 'iPhone' | grep -Eo '[0-9A-F-]{36}' | tail -1 || true)"
    [[ -z "${TARGET_UDID}" ]] && { echo "✖ No hay simuladores de iPhone disponibles. Instalalos desde Xcode." >&2; exit 1; }
  fi
  echo "▶ Booteando simulador ${DEVICE_NAME:-(iPhone más nuevo)}…"
  xcrun simctl boot "${TARGET_UDID}" 2>/dev/null || true
  BOOTED_UDID="${TARGET_UDID}"
fi
open -a Simulator
echo "▶ Simulador: ${BOOTED_UDID}"

# ── 2. Avisar si el puerto de Metro está tomado ────────────────────────────────
# Silenciarlo sería peor: Metro elegiría otro puerto y el dev-client se conectaría al viejo.
if lsof -nP -tiTCP:"${METRO_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "⚠ El puerto ${METRO_PORT} ya está ocupado (¿otro Metro vivo?). Liberalo o exportá METRO_PORT." >&2
fi

# ── 3. Compilar el dev-client si falta (o si lo pidieron) ──────────────────────
cd "${ROOT}/apps/mobile"

if [[ "${FORCE_REBUILD}" -eq 1 ]] || ! xcrun simctl listapps "${BOOTED_UDID}" 2>/dev/null | grep -q "${APP_ID}"; then
  if [[ "${FORCE_REBUILD}" -eq 1 ]]; then
    echo "▶ --rebuild: recompilando el dev-client…"
  else
    echo "▶ El dev-client (${APP_ID}) no está instalado — compilando (lento SOLO la 1ª vez)…"
  fi
  # `expo run:ios` compila + instala + abre + deja Metro corriendo: es el camino completo.
  exec npx expo run:ios --device "${BOOTED_UDID}" --port "${METRO_PORT}" "$@"
fi

# ── 4. Camino rápido: el dev-client ya está instalado ──────────────────────────
echo "▶ Dev-client ya instalado ✓"
echo "▶ expo start --dev-client --ios --port ${METRO_PORT}"
exec npx expo start --dev-client --ios --port "${METRO_PORT}" "$@"
