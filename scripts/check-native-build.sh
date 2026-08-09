#!/usr/bin/env bash
# check-native-build.sh — ¿El binario instalado en el device tiene TODOS los módulos nativos que
# el JS va a pedirle?
#
# Metro sirve el JS al instante, pero un módulo NATIVO sólo existe si se compiló dentro de la app.
# Cuando alguien instala una dependencia nativa y NO recompila, la app no crashea: el componente
# simplemente no renderiza. Eso costó una sesión entera de depuración (texto del chat invisible,
# 2026-08-09) porque el síntoma parece un bug de estilos, no una dep faltante.
#
# Compara las dependencias de apps/mobile que traen `.podspec` (= tienen código nativo) contra
# ios/Podfile.lock (= lo que realmente se compiló).
#
# Uso:   ./scripts/check-native-build.sh          # informa y sale 0/1
#        ./scripts/check-native-build.sh --quiet  # sólo habla si hay problema
#
# Salida: 0 = al día · 1 = falta prebuild/rebuild
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUIET="${1:-}"

if [[ ! -f "${ROOT}/apps/mobile/ios/Podfile.lock" ]]; then
  echo "⚠ No existe apps/mobile/ios/Podfile.lock — el proyecto nativo no está generado."
  echo "  → EXPO_FREE_SIGNING=1 npx expo prebuild --clean   (desde apps/mobile)"
  exit 1
fi

MISSING="$(node -e '
const fs = require("fs"), path = require("path");
const root = process.argv[1];
const pkg = JSON.parse(fs.readFileSync(path.join(root, "apps/mobile/package.json"), "utf8"));
const deps = Object.keys(pkg.dependencies || {});
// pnpm puede hoistear al root del workspace o dejarlo en el paquete: se miran los dos.
const roots = ["apps/mobile/node_modules", "node_modules"].map(r => path.join(root, r));
const lock = fs.readFileSync(path.join(root, "apps/mobile/ios/Podfile.lock"), "utf8");
const missing = [];
for (const dep of deps) {
  for (const r of roots) {
    const dir = path.join(r, dep);
    if (!fs.existsSync(dir)) continue;
    // Un `.podspec` en la raíz del paquete = trae código nativo que hay que compilar.
    const spec = fs.readdirSync(dir).find(f => f.endsWith(".podspec"));
    // El pod se llama como el archivo, NO como el paquete npm
    // (react-native-enriched-markdown → ReactNativeEnrichedMarkdown.podspec).
    if (spec && !lock.includes(spec.replace(/\.podspec$/, ""))) missing.push(dep);
    break; // el primer root que lo tenga manda
  }
}
process.stdout.write(missing.join(" "));
' "${ROOT}")"

if [[ -n "${MISSING}" ]]; then
  echo "⚠ El build nativo está DESACTUALIZADO. Estas dependencias tienen código nativo que NO"
  echo "  está compilado en la app instalada:"
  for m in ${MISSING}; do echo "    · ${m}"; done
  echo
  echo "  Metro te va a servir el JS igual, pero esos componentes renderizarán VACÍO —"
  echo "  sin crash ni error, que es lo que lo hace difícil de diagnosticar."
  echo
  echo "  Arreglo (las DOS líneas; la env también en el prebuild, ver plugins/with-free-signing.js):"
  echo "    cd ${ROOT}/apps/mobile"
  echo "    EXPO_FREE_SIGNING=1 npx expo prebuild --clean"
  echo "    ./scripts/ios-device-build.sh          # o: EXPO_FREE_SIGNING=1 npx expo run:ios --device <udid>"
  exit 1
fi

[[ "${QUIET}" == "--quiet" ]] || echo "✓ Build nativo al día (todas las deps nativas están en Podfile.lock)."
exit 0
