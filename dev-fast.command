#!/usr/bin/env bash
# dev-fast.command — Lanzador de doble clic (y objetivo del Atajo de Siri) para el MODO RÁPIDO:
# el mismo entorno de dev, pero con el bundle en modo PRODUCCIÓN (`__DEV__=false`, minificado).
#
#   Doble clic en Finder / Dock  →  esta misma ventana de Terminal corre ./scripts/dev-fast.sh
#   Siri / Atajos               →  el Atajo hace `open` de este archivo
#
# CUÁNDO USAR ÉSTE Y NO `dev-up.command`: cuando lo que se va a hacer es JUZGAR cómo se SIENTE algo
# —una animación, un scroll, la fluidez al navegar—. En modo desarrollo esos juicios NO valen: el
# andamiaje (Hermes compilando en caliente, `__DEV__`, el inspector de red reteniendo respuestas,
# Fast Refresh guardando módulos viejos) hunde el hilo de JS por sí solo. Ver `scripts/dev-fast.sh`.
#
# Para ESCRIBIR código, `dev-up.command` — aquí no hay Fast Refresh ni avisos, y los errores salen
# minificados.
#
# Vive en la RAÍZ del repo a propósito: resuelve su propia carpeta, así funciona sin importar
# desde dónde lo abras (Finder abre Terminal en $HOME, no en el repo).
cd "$(dirname "${BASH_SOURCE[0]}")" || { echo "✖ No pude ubicar el repo"; exit 1; }
exec ./scripts/dev-fast.sh "$@"
