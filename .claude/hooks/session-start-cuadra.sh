#!/usr/bin/env bash
# SessionStart hook (cuadra-app) — inyecta el contexto de entorno que la auditoría de
# fricción (2026-07-09) mostró que se re-descubre a mano cada sesión: registro de puertos,
# el CORS_ORIGINS fantasma, y el camino sancionado para inspeccionar config (.env).
echo "CUADRA DEV ENVIRONMENT (hook-enforced):"
echo "- Puertos FIJOS: web :3006 (NUNCA :3000) · api :8005 · metro :8087 · postgres :5433. Nunca propongas otros."
echo "- Para inspeccionar config/env (.env, CORS, URLs, provider): usa scripts/env-doctor.sh — NUNCA leas .env directo (deny rule) y NUNCA reintentes un comando denegado."
echo "- Rutas: siempre paths ABSOLUTOS desde la raíz del repo o git -C; jamás 'cd apps/... &&' con relativos apilados."

if [ -n "${CORS_ORIGINS:-}" ]; then
  echo "⚠ ALERTA: CORS_ORIGINS='${CORS_ORIGINS}' está exportada en la shell que lanzó esta sesión — es la env var FANTASMA que rompe el preflight del web. Avisa al usuario que corra 'unset CORS_ORIGINS' en su terminal (dev-up.sh ya se protege solo, pero un API lanzado a mano NO)."
fi
exit 0
