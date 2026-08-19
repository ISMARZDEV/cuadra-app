#!/usr/bin/env bash
# ios-device-release.sh — Compila Cuadra en RELEASE, la firma con tu free personal team y la
# instala en el iPhone/iPad. La app queda AUTÓNOMA: no necesita Metro ni la Mac para arrancar.
#
# Uso:
#   ./scripts/ios-device-release.sh                 # el iPhone (por defecto)
#   ./scripts/ios-device-release.sh <UDID>          # otro device (UDID de hardware)
#   ./scripts/ios-device-release.sh --ip 10.0.0.89  # forzar la IP del backend
#
# ── EN QUÉ SE DIFERENCIA DE `ios-device-build.sh` (Debug), QUE ES TODO ────────────────────────
#
# En Debug el JS lo sirve Metro EN VIVO, así que `EXPO_PUBLIC_API_URL` se decide al arrancar Metro
# (eso hace `dev-up.sh`) y se puede cambiar reiniciándolo. En RELEASE el bundle se HORNEA DENTRO
# del binario durante el build, así que esa variable QUEDA CONGELADA PARA SIEMPRE en el `.app`.
#
# ⚠️ Y ahí vivía un defecto real: `apps/mobile/.env` dice `EXPO_PUBLIC_API_URL=http://localhost:3000`,
# que está mal por dos motivos —`localhost` desde el teléfono ES EL TELÉFONO, y el puerto de la API
# es 8005, no 3000—. En desarrollo nunca se notó porque `dev-up.sh` lo pisa al arrancar Metro. Sólo
# muerde en release, y por eso llevaba tanto sin descubrirse: nunca se había hecho uno.
#
# Este script inyecta la IP LAN de la Mac en el ENTORNO DEL BUILD, que es lo que gana sobre `.env`
# (dotenv no pisa variables ya presentes en el proceso). Mismo criterio que `dev-up.sh`, movido al
# único momento que importa en release: la compilación.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="${ROOT}/apps/mobile/ios/Cuadra.xcworkspace"
SCHEME="Cuadra"
CONFIG="Release"
TEAM_ID="DF4622YDDJ"
API_PORT=8005
# El iPhone 12 de Ismael. Se deja explícito para que el arranque por doble clic no dependa de en
# qué orden `xctrace` liste los devices — con el iPad conectado a la vez, «el primero» es una lotería.
DEFAULT_UDID="00008101-001E602002D0001E"

FORCED_IP=""
UDID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ip) FORCED_IP="${2:-}"; shift 2 ;;
    *)    UDID="$1"; shift ;;
  esac
done
UDID="${UDID:-${DEFAULT_UDID}}"

# ── IP LAN de la Mac ───────────────────────────────────────────────────────────
# La misma detección que `dev-up.sh`, para que Debug y Release apunten al mismo sitio.
if [[ -n "${FORCED_IP}" ]]; then
  IP="${FORCED_IP}"
else
  DEF_IF="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')"
  IP="$(ipconfig getifaddr "${DEF_IF:-en0}" 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
fi
if [[ -z "${IP}" ]]; then
  echo "✖ No pude detectar la IP LAN. Conectate al Wi-Fi (o pasá --ip <ip>)." >&2
  exit 1
fi
API_URL="http://${IP}:${API_PORT}"
echo "▶ Device:  ${UDID}"
echo "▶ Backend: ${API_URL}  (queda HORNEADO en el binario)"

# ── El device tiene que estar ahí de verdad ────────────────────────────────────
# `devicectl` y no `xctrace`: con el teléfono conectado y desbloqueado, `xctrace` lo sigue
# listando como offline. Para el ESTADO manda devicectl; `xctrace` sólo sirve para leer el UDID.
# ⚠️ SE CAPTURA PRIMERO Y SE FILTRA DESPUÉS, sin tubería, y hay motivo. Con `set -o pipefail`,
# `... | grep -q` FALLA aunque encuentre lo que busca: `grep -q` sale al primer acierto y cierra la
# tubería, `xcrun` recibe SIGPIPE y muere, y pipefail se queda con ESE código. La guarda daba «no
# hay ningún device» con el iPhone conectado y disponible.
DEVICES="$(xcrun devicectl list devices 2>/dev/null || true)"
if ! grep -q "available" <<<"${DEVICES}"; then
  echo "✖ No hay ningún device disponible. Conectá el iPhone por cable, desbloquealo y dale 'Confiar'." >&2
  exit 1
fi

# ── Proyecto nativo al día ─────────────────────────────────────────────────────
# `EXPO_FREE_SIGNING=1` va TAMBIÉN en el prebuild: el plugin escribe el `.entitlements` durante los
# mods, y si `ios/` ya existe no vuelven a correr → xcodebuild muere con un error 65 ilegible.
if [[ ! -d "${ROOT}/apps/mobile/ios" ]]; then
  echo "▶ No existe ios/ — generando el proyecto nativo…"
  ( cd "${ROOT}/apps/mobile" && EXPO_FREE_SIGNING=1 npx expo prebuild --clean )
elif ! "${ROOT}/scripts/check-native-build.sh" --quiet; then
  echo "▶ Regenerando el proyecto nativo (hay deps nativas sin compilar)…"
  ( cd "${ROOT}/apps/mobile" && EXPO_FREE_SIGNING=1 npx expo prebuild --clean )
fi

ENTITLEMENTS="${ROOT}/apps/mobile/ios/${SCHEME}/${SCHEME}.entitlements"
if [[ -f "${ENTITLEMENTS}" ]] && grep -qE "aps-environment|applesignin" "${ENTITLEMENTS}"; then
  echo "✖ Las entitlements traen capabilities que un Apple ID GRATUITO no puede provisionar." >&2
  echo "  El prebuild corrió SIN EXPO_FREE_SIGNING=1. Rehacelo así:" >&2
  echo "    cd ${ROOT}/apps/mobile && EXPO_FREE_SIGNING=1 npx expo prebuild --clean" >&2
  exit 1
fi

PBX="${ROOT}/apps/mobile/ios/Cuadra.xcodeproj/project.pbxproj"
if ! grep -q "DEVELOPMENT_TEAM = ${TEAM_ID};" "${PBX}"; then
  echo "▶ Inyectando DEVELOPMENT_TEAM=${TEAM_ID} + firma automática…"
  perl -i -pe 's/^(\s*)PRODUCT_NAME = '"${SCHEME}"';/$1PRODUCT_NAME = '"${SCHEME}"';\n$1CODE_SIGN_STYLE = Automatic;\n$1DEVELOPMENT_TEAM = '"${TEAM_ID}"';/g' "${PBX}"
fi

# ── Build ──────────────────────────────────────────────────────────────────────
# ⚠️ SIN `| tail` NI TUBERÍAS AL FINAL. Con `set -o pipefail` ausente en la tubería, el estado que
# sobrevive es el del ÚLTIMO comando, así que un build FALLIDO sale con código 0 y el script sigue
# como si nada hasta reventar más adelante con un mensaje que no tiene que ver. Ya pasó.
echo "▶ Compilando en ${CONFIG} (la primera vez tarda varios minutos)…"
EXPO_PUBLIC_API_URL="${API_URL}" \
xcodebuild -workspace "${WORKSPACE}" -scheme "${SCHEME}" -configuration "${CONFIG}" \
  -destination "id=${UDID}" \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  build

# Misma trampa que arriba: `find | head -1` puede matar a `find` con SIGPIPE en cuanto `head` tiene
# lo suyo. El `|| true` deja que el `[[ -d ]]` de la línea siguiente sea quien decida.
APP="$(find "${HOME}/Library/Developer/Xcode/DerivedData/${SCHEME}-"*"/Build/Products/${CONFIG}-iphoneos" -maxdepth 1 -name "${SCHEME}.app" 2>/dev/null | head -1 || true)"
[[ -d "${APP}" ]] || { echo "✖ No encontré ${SCHEME}.app compilado en ${CONFIG}-iphoneos." >&2; exit 1; }

# ── VERIFICAR EN EL ARTEFACTO, no en el «BUILD SUCCEEDED» ──────────────────────
# Un build puede terminar en verde y aun así llevar la URL equivocada horneada: es exactamente el
# defecto que este script existe para no repetir. Así que se MIRA DENTRO del bundle.
BUNDLE="${APP}/main.jsbundle"
if [[ -f "${BUNDLE}" ]]; then
  if grep -qF "${API_URL}" "${BUNDLE}"; then
    echo "✓ El bundle apunta a ${API_URL}"
  else
    echo "✖ El bundle NO tiene ${API_URL} horneado." >&2
    echo "  Lo que sí trae:" >&2
    grep -oE 'https?://[0-9a-zA-Z.:-]+' "${BUNDLE}" | sort -u | grep -E ':(3000|8005)' | head >&2 || true
    echo "  El .env pisó al entorno. Revisá apps/mobile/.env — ver la cabecera de este script." >&2
    exit 1
  fi
else
  echo "⚠ No hay main.jsbundle: ¿seguro que compilaste en Release?" >&2
fi

# Cuándo caduca la firma. Los 7 días son del PERFIL, no del certificado (ése dura un año).
PROFILE="${APP}/embedded.mobileprovision"
if [[ -f "${PROFILE}" ]]; then
  EXP="$(security cms -D -i "${PROFILE}" 2>/dev/null | plutil -extract ExpirationDate raw - 2>/dev/null || true)"
  [[ -n "${EXP}" ]] && echo "✓ La firma caduca: ${EXP}  (renovar = volver a correr esto)"
fi

echo "▶ Instalando en ${UDID}…"
xcrun devicectl device install app --device "${UDID}" "${APP}"

cat <<EOF

✅ Cuadra instalada en RELEASE. Ya NO necesita Metro.

   Para que la app tenga datos, la API debe estar viva y atada a la LAN:
     ./dev-up.command      (levanta Postgres + API en 0.0.0.0:${API_PORT} + web + Metro)

   El teléfono y la Mac tienen que estar en la MISMA Wi-Fi.
   Si cambia la IP de la Mac, hay que RECOMPILAR: la URL va horneada.
EOF
