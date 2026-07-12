#!/usr/bin/env bash
# dagster-up.command — Lanzador de doble clic (y objetivo del Atajo "Levantar Dagster") para la UI de
# ingesta de Save, AISLADA del backend/web.
#
#   Doble clic en Finder / Dock  →  esta ventana de Terminal corre ./scripts/dagster-dev.sh
#   Siri / Atajos               →  el Atajo hace `open` de este archivo
#
# Dagster NO lo levanta dev-up.sh (es intencional): vive aparte, en el puerto 3070, con DAGSTER_HOME
# fuera del repo. Vive en la RAÍZ del repo para resolver su propia carpeta sin importar desde dónde se abra.
cd "$(dirname "${BASH_SOURCE[0]}")" || { echo "✖ No pude ubicar el repo"; exit 1; }
exec ./scripts/dagster-dev.sh "$@"
