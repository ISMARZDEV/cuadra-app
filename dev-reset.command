#!/usr/bin/env bash
# dev-reset.command — Lanzador de doble clic (y objetivo del Atajo de Siri) para el RESET no destructivo.
#   Doble clic / Siri (vía `open`)  →  Terminal corre ./scripts/dev-reset.sh (limpia caché + re-levanta).
cd "$(dirname "${BASH_SOURCE[0]}")" || { echo "✖ No pude ubicar el repo"; exit 1; }
exec ./scripts/dev-reset.sh "$@"
