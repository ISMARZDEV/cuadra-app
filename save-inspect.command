#!/usr/bin/env bash
# save-inspect.command — Lanzador de doble clic (y objetivo del Atajo "Inspeccionar Save") para el
# tablero READ-ONLY del schema Save (extracción · matching · frescura). No escribe nada.
# Abre un MENÚ para elegir qué proveedor inspeccionar (o «todos» para el panorama general).
#   Doble clic / Siri (vía `open`)  →  Terminal pregunta la fuente y muestra el reporte.
cd "$(dirname "${BASH_SOURCE[0]}")/apps/api" || { echo "✖ No pude ubicar apps/api"; exit 1; }
uv run python -m seeds.save_inspect --menu "$@"
echo ""
read -r -p "· Enter para cerrar ·" _
