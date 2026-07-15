#!/usr/bin/env bash
# dagster-down.command — Lanzador de doble clic (y objetivo del Atajo "Apagar Dagster") para TUMBAR
# la UI de ingesta sin tocar el backend/web.
#   Doble clic / Siri (vía `open`)  →  Terminal corre ./scripts/dagster-down.sh y muestra el resumen.
cd "$(dirname "${BASH_SOURCE[0]}")" || { echo "✖ No pude ubicar el repo"; exit 1; }
exec ./scripts/dagster-down.sh "$@"
