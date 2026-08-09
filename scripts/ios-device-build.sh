#!/usr/bin/env bash
# ios-device-build.sh — Compila Cuadra, FIRMA con tu free personal team e INSTALA
# en un iPhone/iPad físico. Registra el device en el perfil si hace falta.
#
# Uso:
#   ./scripts/ios-device-build.sh                 # autodetecta el primer device conectado
#   ./scripts/ios-device-build.sh <UDID>          # un device específico (hardware UDID)
#
# PRE-REQUISITO (una sola vez): el certificado + perfil de free signing deben existir.
# Si nunca firmaste con este team, hacé primero el "truco del proyecto señuelo"
# (ver docs/running-on-apple-devices.md → Firma gratis). Luego este script ya funciona.
#
# Device conectado por cable, desbloqueado, "Confiar", y Modo Desarrollador ON.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="${ROOT}/apps/mobile/ios/Cuadra.xcworkspace"
SCHEME="Cuadra"
CONFIG="Debug"
TEAM_ID="DF4622YDDJ"   # ⚠ tu free personal team (lo lee del proyecto señuelo, NO el del nombre del cert)

# ── Device ─────────────────────────────────────────────────────────────────────
UDID="${1:-}"
if [[ -z "${UDID}" ]]; then
  UDID="$(xcrun xctrace list devices 2>/dev/null | awk -F'[()]' '/iPhone|iPad/ && !/Simulator/ {print $(NF-1); exit}')"
fi
if [[ -z "${UDID}" ]]; then
  echo "✖ No encontré un device conectado. Conectá el iPhone/iPad por cable y desbloquealo." >&2
  echo "  Devices:"; xcrun devicectl list devices 2>/dev/null | grep -iE "iphone|ipad" || true
  exit 1
fi
echo "▶ Device: ${UDID}"

# ── Proyecto nativo al día ─────────────────────────────────────────────────────
# `xcodebuild` compila lo que HAY en ios/. Si alguien instaló una dependencia nativa y no
# regeneró el proyecto, esto compila y firma feliz un binario SIN ese módulo: la app corre y el
# componente renderiza vacío, sin crash ni error. Se prebuildea acá para que no pase.
#
# ⚠ `EXPO_FREE_SIGNING=1` va TAMBIÉN en el prebuild, no sólo en el build. El plugin escribe el
# `.entitlements`, y ese archivo se genera EN EL PREBUILD: si `ios/` ya existe, un `run:ios`
# posterior no vuelve a correr los mods y la variable llega tarde → xcodebuild muere con
# error 65 («Personal development teams do not support Sign In with Apple / Push Notifications»).
# Medido el 2026-08-09; ver plugins/with-free-signing.js.
if [[ ! -d "${ROOT}/apps/mobile/ios" ]]; then
  echo "▶ No existe ios/ — generando el proyecto nativo…"
  ( cd "${ROOT}/apps/mobile" && EXPO_FREE_SIGNING=1 npx expo prebuild --clean )
elif ! "${ROOT}/scripts/check-native-build.sh" --quiet; then
  echo "▶ Regenerando el proyecto nativo (hay deps nativas sin compilar)…"
  ( cd "${ROOT}/apps/mobile" && EXPO_FREE_SIGNING=1 npx expo prebuild --clean )
fi

# Guarda de último momento: si las entitlements de pago sobrevivieron, `xcodebuild` moriría con un
# error 65 ilegible. Mejor decirlo acá, con el arreglo exacto.
ENTITLEMENTS="${ROOT}/apps/mobile/ios/${SCHEME}/${SCHEME}.entitlements"
if [[ -f "${ENTITLEMENTS}" ]] && grep -qE "aps-environment|applesignin" "${ENTITLEMENTS}"; then
  echo "✖ Las entitlements traen capabilities que un Apple ID GRATUITO no puede provisionar." >&2
  echo "  El prebuild corrió SIN EXPO_FREE_SIGNING=1. Rehacelo así:" >&2
  echo "    cd ${ROOT}/apps/mobile && EXPO_FREE_SIGNING=1 npx expo prebuild --clean" >&2
  exit 1
fi

# ── Asegurar firma automática + team en el proyecto (se pierde tras `expo prebuild`) ──
PBX="${ROOT}/apps/mobile/ios/Cuadra.xcodeproj/project.pbxproj"
if ! grep -q "DEVELOPMENT_TEAM = ${TEAM_ID};" "${PBX}"; then
  echo "▶ Inyectando DEVELOPMENT_TEAM=${TEAM_ID} + firma automática en el proyecto…"
  perl -i -pe 's/^(\s*)PRODUCT_NAME = '"${SCHEME}"';/$1PRODUCT_NAME = '"${SCHEME}"';\n$1CODE_SIGN_STYLE = Automatic;\n$1DEVELOPMENT_TEAM = '"${TEAM_ID}"';/g' "${PBX}"
fi

# ── Build + firma (registra el device en el perfil si falta) ───────────────────
echo "▶ Compilando + firmando (puede tardar la primera vez)…"
xcodebuild -workspace "${WORKSPACE}" -scheme "${SCHEME}" -configuration "${CONFIG}" \
  -destination "id=${UDID}" \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  build

# ── Instalar ───────────────────────────────────────────────────────────────────
APP="$(find ~/Library/Developer/Xcode/DerivedData/${SCHEME}-*/Build/Products/${CONFIG}-iphoneos -maxdepth 1 -name "${SCHEME}.app" 2>/dev/null | head -1)"
[[ -d "${APP}" ]] || { echo "✖ No encontré ${SCHEME}.app compilado." >&2; exit 1; }
echo "▶ Instalando ${APP} en ${UDID}…"
xcrun devicectl device install app --device "${UDID}" "${APP}"

echo "✅ Instalado. Abrí la app en el device y conectá al Metro de ./scripts/dev-up.sh"
