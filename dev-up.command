#!/usr/bin/env bash
# dev-up.command — Lanzador de doble clic (y objetivo del Atajo de Siri) para el entorno de dev.
#
#   Doble clic en Finder / Dock  →  esta misma ventana de Terminal corre ./scripts/dev-up.sh
#   Siri / Atajos               →  el Atajo hace `open` de este archivo (ver README/instrucciones)
#
# Vive en la RAÍZ del repo a propósito: resuelve su propia carpeta, así funciona sin importar
# desde dónde lo abras (Finder abre Terminal en $HOME, no en el repo).
cd "$(dirname "${BASH_SOURCE[0]}")" || { echo "✖ No pude ubicar el repo"; exit 1; }
exec ./scripts/dev-up.sh "$@"
