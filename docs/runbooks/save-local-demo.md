# Runbook — Probar Save en local de punta a punta

> Cómo levantar Cuadra en local y RECORRER el sistema Save completo: ingesta → matching →
> cola de revisión (admin/OFV) → comparación pública de precios. Pensado para entender el flujo
> y para depurar el matching con datos reales.
>
> Dominio: skill `cuadra-save` · matching: `cuadra-save-matching` · admin: `cuadra-save-admin`.

## El pipeline (mapa mental)

```
Scrape supermercados (VTEX/Magento/REST) → MATCHING (cascada F2.0) → decide:
     ├─ auto-link (alta confianza + tamaño OK) → canonical_product → COMPARACIÓN PÚBLICA
     └─ duda / conflicto                        → COLA DE REVISIÓN (admin) → un humano resuelve
```

- **Comparación pública** = el matching que salió bien (auto-link).
- **Cola de revisión** = el que dudó, retenido para no corromper la data (regla sagrada #4: nunca un falso merge).

## 0. Prerrequisitos

- Postgres (pgvector) arriba: `make db-up` · migraciones al día: `make migrate`.
- Deps instaladas (`pnpm i`, y `apps/api` con `uv sync` incluyendo el grupo `ingestion` si vas a correr matching in-process).
- **Proveedor LLM en dev**: `LLM_PROVIDER=openai` → el juez de matching y los agentes corren **gpt-4o** (no Claude). En prod se cambia a `anthropic`. Ver `apps/api/src/shared/llm/`.

## 1. Levantar el stack (API + web)

El API vive en `:8005`, la web (Vike) en `:3006`.

```bash
# API (FastAPI, auto-reload)
cd apps/api && uv run uvicorn src.main:app --host 0.0.0.0 --port 8005 --reload --reload-dir src

# Web (Vike + Vite) — en otra terminal
cd apps/web && pnpm dev
```

Reiniciar limpio (mata zombies SIN tumbar Postgres):

```bash
for p in 8005 3006 3007; do lsof -nP -tiTCP:$p -sTCP:LISTEN | xargs kill 2>/dev/null; done
```

> `scripts/dev-up.sh` levanta API + Metro (móvil) pero NO la web, y `scripts/dev-down.sh` baja
> también Postgres — por eso para un demo web conviene arrancar API/web a mano como arriba.

Verificar salud:

```bash
curl -fsS http://localhost:8005/v1/health          # {"status":"ok",...}
curl -fsS -o /dev/null -w '%{http_code}' http://localhost:3006/   # 302 → /es/do (redirect de locale, OK)
```

## 2. Recorrido público (sin auth)

Rutas web (con prefijo de locale/país `/{locale}/{country}/`):

| Página | URL |
|---|---|
| Home de Save | http://localhost:3006/es/do/save/supermarkets |
| Comparación de un producto | http://localhost:3006/es/do/save/supermarkets/product/`<slug>` |
| Búsqueda | http://localhost:3006/es/do/save/supermarkets/search?q=arroz |

Ejemplo de slug real: `arroz-premium-campos-10-lb`.

Ver la misma data por API (útil para depurar):

```bash
# Buscar productos canónicos
curl -fsS "http://localhost:8005/v1/save/search?q=arroz&market_id=DO"

# Comparación de precios entre supermercados (por SLUG, no por id)
curl -fsS "http://localhost:8005/v1/save/compare?slug=arroz-premium-campos-10-lb&market=DO"
```

La comparación devuelve las `entries` por proveedor con `price_minor`, `unit_price_minor`
(normalizado por kg/L), y `is_cheapest`. Todas del MISMO `display_size` — apples-to-apples,
garantizado por el **size gate** de la cascada.

## 3. Cola de revisión (admin / OFV) — requiere auth

Las rutas `/admin/*` están EXENTAS del prefijo de locale y protegidas por un gate SSR que lee la
cookie `__session` (RBAC: capability `admin_save_matching_review`). El dev-login guarda el token en
`localStorage` → inalcanzable server-side → **siempre 403 en SSR**. Para ver el admin en local sin
Clerk, hay que setear un token dev HS256 como cookie `__session`.

> ⚠️ **SOLO DEV.** Es un atajo de desarrollo (token HS256 firmado con `JWT_SECRET` local). Nunca
> en un entorno compartido/producción. Documentado también en `apps/web/.../require-admin.ts`.

### 3.1 Necesitas un super_admin

```bash
# ¿Hay un super_admin? (y su user_id)
cd apps/api && uv run python -c "
from src.shared.db.base import SessionLocal
from sqlalchemy import text
with SessionLocal() as s:
    for r in s.execute(text('''select u.email, ur.role_key, u.id from identity.\"user\" u
        join identity.user_role ur on ur.user_id=u.id where ur.role_key='super_admin' ''')).all():
        print(r.email, r.id)
"
```

Si no hay ninguno: provisiona el usuario (login una vez, se auto-crea como `normal_user`) y luego:
`INSERT INTO identity.user_role (user_id, role_key) VALUES ('<uuid>', 'super_admin') ON CONFLICT DO NOTHING;`

> Tras la Fase 1 del admin, **re-corre `seed_identity`** en cada entorno ya sembrado — agrega las
> capabilities `admin_save_*` al rol super_admin (el seed usa `on_conflict_do_nothing`).

### 3.2 Genera el token dev y ábrelo en el navegador

```bash
# Firma un JWT dev con el user_id del super_admin
cd apps/api && uv run python -c "from src.contexts.identity.infrastructure.auth import encode_token; print(encode_token({'sub':'<SUPER_ADMIN_USER_ID>'}))"
```

En la consola del navegador (F12), estando en `localhost:3006`:

```js
document.cookie = "__session=<TOKEN>; path=/"
```

Luego abre: **http://localhost:3006/admin/review-queue**

Verás la cola de `pending_review` (producto de tienda, `method` `llm`/`human`, confianza, candidato).
Ahí se aprueba, se rechaza, o se crea el canónico correcto.

Por API directo (con el mismo token como Bearer):

```bash
TOKEN=$(cd apps/api && uv run python -c "from src.contexts.identity.infrastructure.auth import encode_token; print(encode_token({'sub':'<SUPER_ADMIN_USER_ID>'}))")
curl -fsS -H "Authorization: Bearer $TOKEN" "http://localhost:8005/v1/admin/save/review-queue?market=DO&limit=10"
```

## 4. Correr el matching (poblar/actualizar la cola) — opcional

`make save-refresh` scrapea las fuentes y enruta lo desconocido a la cascada. **Costo real**:
descarga BGE-M3 (~2GB la primera vez), pega a sitios de súper reales, y llama al juez LLM (tokens).
Con el flag ON e in-process:

```bash
cd apps/api && SAVE_MATCHING_CASCADE_ENABLED=true uv run --group ingestion python -m seeds.save_refresh
```

Para un run ACOTADO (una query, sin quemar todo), `build_sources(queries=("arroz",))` filtra por
query — ver los scripts de humo/calibración usados en Batch 10.

> Gotcha: re-correr sobre productos ya vistos NO los re-matchea (el `exists()` por
> `(provider_id, external_id)` los salta). Para re-matchear hay que borrar los `store_product`
> primero. FKs que apuntan a `store_product`: `save.price`, `save.product_match`;
> `save.review_candidate` cuelga de `product_match` (columna `product_match_id`).

## 5. Qué mirar / qué significa

- **Size gate** (Batch 10): el matcher era ciego al tamaño y colapsaba 1/5/20/50 Lb del mismo
  producto en un canónico. Ahora, si el tamaño de la tienda y el del canónico difieren, NO
  auto-linkea → va a revisión. Por eso la comparación pública es apples-to-apples.
- **Cobertura de catálogo**: si un producto no tiene canónico (p. ej. café, cuando el catálogo
  seed es casi solo arroz), TODO va a revisión — es correcto, no un bug de umbrales.
- **Discriminador pendiente**: calidad/tipo (Premium/Integral/Gourmet) — mismo tamaño, producto
  distinto. El size gate no lo cubre; es el siguiente eje.
