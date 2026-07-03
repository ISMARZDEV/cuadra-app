#!/usr/bin/env bash
# dev-sim.command — Lanzador de doble clic (y objetivo del Atajo "Levantar Cuadra Sim") para levantar
# Cuadra ABRIENDO la app en el simulador iOS (dev-build) — backend + Metro + glass nativo real.
cd "$(dirname "${BASH_SOURCE[0]}")" || { echo "✖ No pude ubicar el repo"; exit 1; }
exec ./scripts/dev-sim.sh "$@"
