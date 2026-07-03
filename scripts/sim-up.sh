#!/usr/bin/env bash
# sim-up.sh — Corre la app de Cuadra en el SIMULADOR de iOS usando Expo Go.
#
# A diferencia de dev-up.sh (dispositivos FÍSICOS + dev-client + backend en la LAN), este script
# es para iterar rápido en el simulador con Expo Go:
#
#   bootear simulador (si hace falta) → instalar Expo Go (si falta) → expo start --go --ios
#
# El simulador comparte la red de la Mac, así que `localhost` alcanza la API local — no se necesita
# detectar IP LAN ni dev-client.
#
# Uso:    ./scripts/sim-up.sh            # simulador ya booteado o el primero disponible
#         ./scripts/sim-up.sh "iPhone 17"  # forzar un device por nombre
#         ./scripts/sim-up.sh --clear     # cualquier flag extra se pasa a `expo start`
#
# Requisitos: Xcode + simuladores instalados, node/pnpm. Expo Go se instala solo si falta.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPO_GO_ID="host.exp.Exponent"

# ── 1. Asegurar un simulador booteado ──────────────────────────────────────────
# Si el primer argumento NO empieza con "-", se trata como nombre de device a botear.
DEVICE_NAME=""
if [[ "${1:-}" != "" && "${1:0:1}" != "-" ]]; then
  DEVICE_NAME="$1"; shift
fi

BOOTED_UDID="$(xcrun simctl list devices booted 2>/dev/null | grep -Eo '[0-9A-F-]{36}' | head -1 || true)"

if [[ -z "${BOOTED_UDID}" || -n "${DEVICE_NAME}" ]]; then
  # Elegir UDID: por nombre si se pidió, si no el iPhone disponible más nuevo.
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
echo "▶ Simulador booteado: ${BOOTED_UDID}"

# ── 2. Instalar Expo Go si no está (expo start --ios igual lo haría, lo dejamos explícito) ──
if xcrun simctl listapps "${BOOTED_UDID}" 2>/dev/null | grep -q "${EXPO_GO_ID}"; then
  echo "▶ Expo Go ya instalado ✓"
else
  echo "▶ Expo Go no está instalado — \`expo start --go --ios\` lo descarga e instala automáticamente."
fi

# ── 3. Arrancar Metro en modo Expo Go y abrir en el simulador ──────────────────
# `--go`  fuerza Expo Go (ignora el dev-client que está en package.json).
# `--ios` instala Expo Go (si falta) y abre la app en el simulador booteado.
echo "▶ expo start --go --ios --port 8082"
cd "${ROOT}/apps/mobile"
exec npx expo start --go --ios --port 8082 "$@"
