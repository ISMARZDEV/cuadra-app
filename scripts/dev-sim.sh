#!/usr/bin/env bash
# dev-sim.sh — Levanta Cuadra igual que dev-up.sh (Postgres + migrate + API + Metro :8082) pero
# ABRIENDO la app en el SIMULADOR iOS con el dev-client (--ios), en vez de esperar un device físico
# por QR. Fidelidad nativa COMPLETA (liquid glass real) + backend/datos reales.
#
# La 1ª vez, si el dev-build no está instalado en el simulador, Expo lo compila (`npx expo run:ios`,
# necesita Xcode) — lento una sola vez; después abre al instante.
#
#   Uso:  ./scripts/dev-sim.sh   (o doble clic en dev-sim.command / Atajo "Levantar Cuadra Sim")
#
# Es un thin wrapper: dev-up.sh reenvía "$@" a `expo start`, así que `--ios` viaja hasta el bundler.
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/dev-up.sh" --ios "$@"
