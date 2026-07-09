#!/usr/bin/env bash
# env-doctor.sh — Lente SEGURO de configuración de desarrollo.
#
# Existe porque las deny rules bloquean (con razón) leer .env directo, pero eso dejaba
# sin camino legítimo para debuggear CORS/puertos/URLs: la auditoría 2026-07-09 contó
# ~40 denegaciones por reintentos de `cat/grep .env`. Este script imprime SOLO claves
# no-secretas whitelisted y redacta cualquier valor sensible. Es el ÚNICO camino
# sancionado para que un agente inspeccione la config de dev.
#
# Uso: ./scripts/env-doctor.sh
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Claves cuyo VALOR es seguro mostrar (config de forma, no credenciales).
SAFE_KEYS='CORS_ORIGINS|EXPO_PUBLIC_API_URL|LLM_PROVIDER|MARKET_ID|API_PORT|WEB_PORT|METRO_PORT|ENVIRONMENT|ENV|DEBUG|LOG_LEVEL|LANGSMITH_TRACING|LANGCHAIN_TRACING_V2|LANGCHAIN_PROJECT|SAVE_MATCHING_CASCADE_ENABLED|JUDGE_MATCH_MIN_CONFIDENCE|EMBEDDING_MODEL|VITE_[A-Z_]*|EXPO_PUBLIC_[A-Z_]*'
# Nada que matchee esto muestra su valor jamás (gana sobre SAFE_KEYS).
SECRET_PAT='KEY|SECRET|TOKEN|PASSWORD|PASS|CREDENTIAL|PRIVATE|SALT|SIGNING'

print_env_file() {
  local f="$1"
  [ -f "$f" ] || { echo "  (no existe)"; return; }
  awk -v safe="^(${SAFE_KEYS})=" -v secret="${SECRET_PAT}" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      line=$0; sub(/^[[:space:]]*export[[:space:]]+/, "", line)
      eq=index(line,"="); if (eq==0) next
      k=substr(line,1,eq-1); v=substr(line,eq+1)
      if (toupper(k) ~ secret)      { printf "  %s=<redacted>\n", k }
      else if (k ~ /DATABASE_URL|POSTGRES_URL|_URL$/ && v ~ /:\/\/[^\/@]*@/) {
        gsub(/:\/\/[^\/@]*@/, "://<redacted>@", v); printf "  %s=%s\n", k, v }
      else if (line ~ safe)         { printf "  %s=%s\n", k, v }
      else                          { printf "  %s=<set, valor no whitelisted>\n", k }
    }' "$f"
}

echo "=== env-doctor · $(date '+%Y-%m-%d %H:%M') ==="
echo
echo "-- Fantasmas en la SHELL actual (env vars exportadas a mano) --"
GHOSTS=0
for k in CORS_ORIGINS EXPO_PUBLIC_API_URL DATABASE_URL LLM_PROVIDER; do
  if [ -n "$(printenv "$k" 2>/dev/null)" ]; then
    case "$k" in
      DATABASE_URL) echo "  ⚠ $k=<set en shell — redacted>";;
      *)            echo "  ⚠ $k=$(printenv "$k")  ← sombrea el .env; si no es intencional: unset $k";;
    esac
    GHOSTS=1
  fi
done
[ "$GHOSTS" = "0" ] && echo "  ✓ ninguno"

for envfile in "apps/api/.env" "apps/mobile/.env" "apps/web/.env" ".env"; do
  echo
  echo "-- ${envfile} (solo claves no-secretas) --"
  print_env_file "${ROOT}/${envfile}"
done

echo
echo "-- Puertos (registro fijo: web 3006 · api 8005 · metro 8087 · db 5433) --"
for p in 3006 8005 8087 5433 3000; do
  pid="$(lsof -nP -tiTCP:"$p" -sTCP:LISTEN 2>/dev/null | head -1)"
  if [ -n "$pid" ]; then
    pname="$(ps -p "$pid" -o comm= 2>/dev/null)"
    if [ "$p" = "3000" ]; then
      echo "  ⚠ :3000 OCUPADO ($pname) — el web de Cuadra es :3006; :3000 suele ser OTRO proyecto"
    else
      echo "  ✓ :$p escuchando ($pname)"
    fi
  else
    [ "$p" = "3000" ] || echo "  · :$p libre (servicio no levantado)"
  fi
done
