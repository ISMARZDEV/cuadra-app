#!/usr/bin/env bash
# save-reset.command — Lanzador de doble clic (y objetivo del Atajo "Resetear Save"). Abre un MENÚ
# interactivo que lista los proveedores (con su total de productos en la BD) y te deja elegir:
# limpiar UN proveedor, o dejar el schema en BASELINE LIMPIO («todo»). DESTRUCTIVO → confirma antes.
#   Doble clic / Siri (vía `open`)  →  Terminal muestra el menú, elegís, confirma y ejecuta.
cd "$(dirname "${BASH_SOURCE[0]}")/apps/api" || { echo "✖ No pude ubicar apps/api"; exit 1; }
uv run python -m seeds.save_clean --menu
echo ""
read -r -p "· Enter para cerrar ·" _
