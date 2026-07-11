---
name: cuadra-dev-triggers
description: >
  DISPARAR / PROBAR escenarios de Cuadra end-to-end contra el stack de DEV (no solo tests): sembrar
  la precondición en el DB de dev + correr el use-case/job que produce el efecto + VERIFICAR el
  resultado (feed, endpoint, cola). Cada trigger vive como `apps/api/seeds/trigger_*.py`
  (`uv run python -m seeds.trigger_*`). Trigger: cuando el usuario pide "tira/dispara/simulá/probá/
  generá/trigger/test" una feature en vivo — una alerta de bajada de precio, una ingesta, un match,
  una notificación, una deal, etc. — para VERLA funcionar en la app/simulador/device.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
---

## When to Use

- El usuario dice **"tira/dispara/simulá/probá/generá una X"** y espera VER el efecto en la app
  (device/simulador/web), no un test unitario. Ej: "tira una alerta de bajada de precio".
- Necesitás poblar un feed / cola / pantalla que está vacía porque el evento nunca ocurrió en dev.
- NO es para tests (`pytest`/vitest) — eso es `cuadra-api`/`cuadra-mobile-testing`. Esto es
  disparar un evento REAL en el stack de dev corriendo.

## Critical Patterns

**1. HACELO — no solo lo expliques.** Cuando el usuario pide disparar/probar algo, ejecutá el
trigger vos (contra el DB de dev) y mostrá la evidencia. Es el mandato de la skill.

**2. El método (para CUALQUIER trigger nuevo).** No adivines: leé el use-case/job que produce el
efecto + su repo (para saber el schema), después:
   1. **Sembrá la precondición** en el DB de dev (idempotente; las tablas de precio/`*_scd` son
      **APPEND-ONLY** → un cambio = fila NUEVA, nunca UPDATE).
   2. **Corré el use-case/job** que dispara el efecto (vía `SessionLocal` + los repos/use-cases de
      `src/contexts/...`, NO reimplementes la lógica).
   3. **Verificá**: imprimí las filas/notificaciones creadas, o pegá al endpoint. Sin evidencia, no
      está hecho.
   4. **Persistilo** como `apps/api/seeds/trigger_<algo>.py` y agregá una fila a la tabla de abajo.

**3. Entorno.** Stack de dev arriba con `./scripts/dev-up.sh` (Postgres Docker `cuadra-db`, API
`0.0.0.0:8005`, Metro `:8087`, market **`DO`**). Verificá antes: `docker exec cuadra-db pg_isready -U cuadra`
y `curl -s -o /dev/null -w '%{http_code}' http://localhost:8005/v1/health`. Los triggers corren con
`cd apps/api && uv run python -m seeds.trigger_*` (mismo patrón que `seeds.save_refresh`).

**4. Sesión + repos (patrón).** `from src.shared.db.base import SessionLocal` → `with SessionLocal() as s:`;
usá los repos `Sql*Repository(s)` y los use-cases de `src/contexts/save/application/*` (o el contexto
que aplique). `s.commit()` tras sembrar y tras correr el job.

## Recipes (triggers ya listos)

| Escenario | Comando | Qué hace |
|---|---|---|
| **Alerta de bajada de precio** (feed in-app) | `cd apps/api && uv run python -m seeds.trigger_price_drop [--pct 0.15]` | Inserta una fila `save.price` ~15% más baja para un producto que un user SIGUE, corre `RunAlertMatching` → crea la notificación (`alert_notification`). El user recarga *Ahorra → Alertas de precio → Notificaciones* y la ve. Requiere un follow activo. **NO** dispara push remoto (bloqueado por Apple pago); es solo el feed in-app. |

> Para un trigger que NO está acá: seguí el "método" (Pattern 2), creá `seeds/trigger_<x>.py`,
> corrélo, verificá, y agregá la fila.

## Commands

```bash
# Precheck del stack de dev
docker exec cuadra-db pg_isready -U cuadra
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8005/v1/health   # → 200

# Disparar la alerta de bajada de precio
cd apps/api && uv run python -m seeds.trigger_price_drop

# Ver un trigger existente como plantilla para uno nuevo
sed -n '1,60p' apps/api/seeds/trigger_price_drop.py
```

## Resources

- **Triggers**: `apps/api/seeds/trigger_price_drop.py` (plantilla para nuevos triggers).
- **Dominio de la feature**: `cuadra-save` (alerts/drops/matching/ingesta), `cuadra-api` (hexagonal,
  use-cases, repos). El stack de dev + LAN + device: `expo-ios-free-device`, `scripts/dev-up.sh`.
