#!/usr/bin/env bash
# dev-down.command — Lanzador de doble clic (y objetivo del Atajo de Siri) para TUMBAR el entorno.
#   Doble clic / Siri (vía `open`)  →  Terminal corre ./scripts/dev-down.sh y muestra el resumen.
cd "$(dirname "${BASH_SOURCE[0]}")" || { echo "✖ No pude ubicar el repo"; exit 1; }
exec ./scripts/dev-down.sh "$@"
