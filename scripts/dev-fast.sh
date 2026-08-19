#!/usr/bin/env bash
# dev-fast.sh — El MISMO entorno que `dev-up.sh`, pero con el bundle en modo PRODUCCIÓN.
#
# Para cuando hay que JUZGAR CÓMO SE SIENTE algo: una animación, un scroll, la fluidez al navegar.
#
# ⚠️ POR QUÉ EXISTE ESTE SCRIPT. El modo desarrollo no es «un poco más lento»: es OTRO régimen.
# Medido en este proyecto, la app llegaba a 1.2 GB de RAM con el hilo de JS a 21 fps mientras el de
# UI aguantaba a 60 — y en un build de release la MISMA versión iba fluida. Lo que cuesta es:
#
#   · Hermes compila el JS EN CALIENTE. En producción el bundle viaja ya precompilado a bytecode.
#   · `__DEV__` enciende validaciones en cada paso por el puente nativo.
#   · El inspector de red RETIENE cada respuesta en memoria — y este catálogo trae JSON grandes.
#     Ahí estaba el crecimiento monótono de RAM que parecía una fuga y no lo era.
#   · Fast Refresh mantiene vivas las versiones anteriores de cada módulo que editas.
#
# Esas cuatro cosas SON las herramientas de desarrollo. No se pueden apagar por separado: quitar el
# coste es quitar la función. Por eso son dos modos y no un ajuste.
#
# ⚠️ NO SE PUEDE CAMBIAR DESDE EL MÓVIL. Es una decisión del BUNDLER, se toma al arrancar Metro en
# la Mac. El menú de desarrollo del dispositivo no tiene esta opción — sólo hay que reconectar el
# dev-client al Metro que ya está en este modo.
#
# QUÉ SE PIERDE: Fast Refresh (se recarga entero con `r`), los avisos de LogBox, el inspector de
# red, y los errores salen MINIFICADOS. Para depurar un fallo concreto, volver a `dev-up.sh`.
#
#   Uso:   ./scripts/dev-fast.sh            (añade --clear si Metro trae caché sucia)
#   Normal: ./scripts/dev-up.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "▶ MODO RÁPIDO: bundle de producción (__DEV__=false, minificado)."
echo "  Sin Fast Refresh ni avisos. Para escribir código usa ./scripts/dev-up.sh"
echo

# Todo el trabajo pesado —Postgres, migraciones, API, Web, la IP de la Mac— lo hace `dev-up.sh`,
# que ya reenvía a `expo start` los argumentos que le pasen. Duplicar ese arranque aquí sería tener
# dos verdades sobre cómo se levanta el entorno, y la segunda se quedaría vieja.
exec "${ROOT}/scripts/dev-up.sh" --no-dev --minify "$@"
