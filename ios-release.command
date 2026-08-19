#!/usr/bin/env bash
# Doble clic (o Atajo de Siri) → compila Cuadra en RELEASE y la instala en el iPhone.
cd "$(dirname "$0")"
./scripts/ios-device-release.sh "$@"
echo
echo "Pulsá una tecla para cerrar…"
read -n 1 -s
