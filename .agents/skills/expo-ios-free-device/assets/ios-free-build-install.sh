#!/usr/bin/env bash
# ios-free-build-install.sh (GENÉRICO) — Compila + firma (free personal team) + instala una app
# Expo/RN en un iPhone/iPad físico, registrando el device en el perfil si hace falta.
#
# Variables (con defaults):
#   WORKSPACE   ruta al .xcworkspace      (default: apps/mobile/ios/<SCHEME>.xcworkspace)
#   SCHEME      scheme de Xcode           (REQUERIDO si no se infiere)
#   CONFIG      Debug | Release           (default: Debug)
#   TEAM_ID     free personal team id     (REQUERIDO — sale del DEVELOPMENT_TEAM del proyecto señuelo)
#   UDID        hardware UDID del device  (default: primer iPhone/iPad conectado)
#
# PRE-REQUISITO (una sola vez por Mac/Apple ID): mintear cert+perfil con el "truco del proyecto
# señuelo" (ver references/troubleshooting.md). Sin eso, xcodebuild no puede firmar free teams.
set -euo pipefail

CONFIG="${CONFIG:-Debug}"
: "${SCHEME:?Definí SCHEME (nombre del scheme de Xcode)}"
: "${TEAM_ID:?Definí TEAM_ID (free personal team; = DEVELOPMENT_TEAM del proyecto señuelo)}"
WORKSPACE="${WORKSPACE:-apps/mobile/ios/${SCHEME}.xcworkspace}"
PBX="$(dirname "${WORKSPACE}")/${SCHEME}.xcodeproj/project.pbxproj"

UDID="${UDID:-$(xcrun xctrace list devices 2>/dev/null | awk -F'[()]' '/iPhone|iPad/ && !/Simulator/ {print $(NF-1); exit}')}"
[[ -n "${UDID}" ]] || { echo "✖ Sin device conectado. Conectá y desbloqueá el iPhone/iPad." >&2; exit 1; }
echo "▶ Device ${UDID} · scheme ${SCHEME} · team ${TEAM_ID}"

# Firma automática + team en el target (se pierde tras `expo prebuild` → reinyectar).
if [[ -f "${PBX}" ]] && ! grep -q "DEVELOPMENT_TEAM = ${TEAM_ID};" "${PBX}"; then
  echo "▶ Inyectando CODE_SIGN_STYLE=Automatic + DEVELOPMENT_TEAM=${TEAM_ID}…"
  perl -i -pe 's/^(\s*)PRODUCT_NAME = '"${SCHEME}"';/$1PRODUCT_NAME = '"${SCHEME}"';\n$1CODE_SIGN_STYLE = Automatic;\n$1DEVELOPMENT_TEAM = '"${TEAM_ID}"';/g' "${PBX}"
fi

echo "▶ Build + firma (registra el device si falta)…"
xcodebuild -workspace "${WORKSPACE}" -scheme "${SCHEME}" -configuration "${CONFIG}" \
  -destination "id=${UDID}" \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  build

APP="$(find ~/Library/Developer/Xcode/DerivedData/${SCHEME}-*/Build/Products/${CONFIG}-iphoneos -maxdepth 1 -name "${SCHEME}.app" 2>/dev/null | head -1)"
[[ -d "${APP}" ]] || { echo "✖ No encontré ${SCHEME}.app." >&2; exit 1; }
echo "▶ Instalando ${APP}…"
xcrun devicectl device install app --device "${UDID}" "${APP}"
echo "✅ Instalado en ${UDID}."
