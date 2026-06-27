#!/usr/bin/env bash
# dev-up.sh (GENÉRICO) — Levanta el dev server de una app Expo apuntando a la IP LAN de la Mac
# para que un iPhone/iPad físico en la misma Wi-Fi pueda alcanzar Metro y (opcional) tu backend.
#
# Configurable por variables de entorno (con defaults):
#   MOBILE_DIR   ruta a la app Expo            (default: apps/mobile)
#   API_PORT     puerto del backend             (default: 8005; vacío = sin backend)
#   START_API    comando para levantar la API   (default: vacío → no arranca backend)
#   API_HEALTH   path de health para esperar     (default: /v1/health)
#
# Ejemplo:
#   API_PORT=8005 START_API='cd apps/api && uv run uvicorn src.main:app --host 0.0.0.0 --port 8005' ./dev-up.sh
#   ./dev-up.sh            # solo Metro (sin backend)
set -euo pipefail

MOBILE_DIR="${MOBILE_DIR:-apps/mobile}"
API_PORT="${API_PORT:-8005}"
START_API="${START_API:-}"
API_HEALTH="${API_HEALTH:-/v1/health}"

# IP LAN de la Mac — el device NO puede usar localhost.
DEF_IF="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')"
IP="$(ipconfig getifaddr "${DEF_IF:-en0}" 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
[[ -n "${IP}" ]] || { echo "✖ Sin IP LAN. Conectate a Wi-Fi." >&2; exit 1; }
echo "▶ IP LAN: ${IP}  (el device debe estar en la MISMA Wi-Fi)"

# Backend opcional, atado a 0.0.0.0 para ser alcanzable desde la LAN.
if [[ -n "${START_API}" ]]; then
  LOG="$(mktemp -t devapi.XXXXXX.log)"
  echo "▶ Backend → http://${IP}:${API_PORT}  (logs: ${LOG})"
  ( bash -c "${START_API}" ) >"${LOG}" 2>&1 &
  API_PID=$!
  trap 'echo; echo "▶ Cerrando backend (${API_PID})"; kill "${API_PID}" 2>/dev/null || true' EXIT INT TERM
  echo -n "  esperando health"
  for _ in $(seq 1 30); do
    curl -fsS -m 2 "http://${IP}:${API_PORT}${API_HEALTH}" >/dev/null 2>&1 && { echo " ✓"; break; }
    echo -n "."; sleep 1
  done
fi

# Metro con la URL de la API inyectada en el bundle (EXPO_PUBLIC_* se resuelve en build time).
echo "▶ Metro :8081 → API http://${IP}:${API_PORT}"
echo "  En el dev-client del device, conectá a  ${IP}:8081"
cd "${MOBILE_DIR}"
if [[ -n "${START_API}" ]]; then
  EXPO_PUBLIC_API_URL="http://${IP}:${API_PORT}" exec npx expo start --dev-client
else
  exec npx expo start --dev-client
fi
