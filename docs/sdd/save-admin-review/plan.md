# Plan · `save-admin-review` (F2 · B1 — Consola OFV: módulo de revisión de matching)

> Estado **2026-07-05** · Rama `feat/save-admin-review` · SDD (explore→propose→spec→design→tasks) ✅
> Modo interactivo · Strict TDD (RED→GREEN). Artefactos en aispace-men `sdd/save-admin-review/*`.
> Catálogo de features + prioridades + fuentes: `docs/sdd/save-admin-review/features.md`.

## 0. Qué es esto

Primer módulo de la **OFV** (back-office único: app + web). Enfoque AHORA = **Save Supermercados**:
la **cola de revisión de matching** (opera la cola que la cascada F2.0 llena) + las **ops de ingesta**
alrededor. Módulos futuros (accesos/RBAC, News, financieros, seguros) = mismo shell, aditivos, fuera.

**Scope = todo P0 + el power pack P1** de `features.md`. **Fuera:** P2 (merge/split, tuneo de umbrales
UI, QA de revisores, editor de catálogo/taxonomía, cmd-K) y P3 (módulos OFV futuros).

## 1. Decisiones cerradas (usuario)

| Decisión | Elegido |
|---|---|
| Shell web | **shadcn/ui + TanStack Table** en `apps/web` `/admin`, SSR-first Vike `+data` (NO TanStack Query), seam `AdminResource` mínimo. NO Refine. |
| Candidatos del revisor | Tabla **`review_candidate`** (top-5) |
| Logo de súper | **Pegar URL** (`provider.logo_url`); upload real diferido (no hay storage en el repo) |
| Bug del FK | Fix vía nuevo use-case **`ResolveReview`** que escribe `store_product.canonical_product_id` + `product_match` en la MISMA tx |

## 2. Reglas + anti-patrones que gobiernan (codificados como requisitos)

- **Sagradas:** la aprobación humana ES el `method="human"`; una mala aprobación corrompe todo aguas
  abajo → el revisor debe VER lo suficiente. La IA nunca calcula/emite precio; `price_type` no se mezcla.
- **Anti-patrones (del estado del arte):** comparación SIN diff resaltado = fuera de spec · métricas de
  costo/latencia por **percentiles p50/p95/p99** (average-only = falla) · rechazo exige **reason-code**
  + mostrar la **señal** (ean|trgm|vector|llm), no un score pelado · orden de cola **incertidumbre-first**
  (FIFO solo override) · gate **server-side** (probado saltándose la UI).
- **Backend:** hexagonal, schema `save` aislado (ADR 33), endpoints thin contract-first (`make openapi`),
  reusar el RBAC ya existente (`require_capability`/`SUPER_ADMIN`). **Web:** `/admin/*` exento de
  locale/sitemap (SEO intacto), gate server-side, token async de Clerk.

## 3. Design (resumen)

**Enfoque backend-first:** persistir lo que la cascada YA computa pero descarta (atributos crudos,
top-N candidatos, costo del juez), arreglar el FK, exponer en `/admin/save/*` gateado, luego el shell.

**Data model (migraciones aditivas/nullable, reversibles):**
- `store_product` + `name/brand/size_text/image_url`
- `product_match` + `reason_code/reason_note/judge_input_tokens/judge_output_tokens/judge_model`
- nuevas: `review_candidate` (FK CASCADE, top-5), `store_registry` (1:1 con provider; platform/base_url/
  endpoints/headers/auth jsonb; health_status/paused_at), `basket_query` (reemplaza `BASKET_QUERIES`)
- `provider.logo_url`

**Backend:** use-cases `ResolveReview` (dueño de la tx), `CreateCanonicalAndLink`, `ListReviewQueue`
(incertidumbre + filtros + paginación), `GetReviewDetail`, provider/source/basket CRUD, `TestSource`
(dry-run SSRF-guarded, cero persistencia), `GetMatchingMetrics` (percentiles). Controller thin
`admin_save.py` + capabilities `ADMIN_SAVE_MATCHING_REVIEW` / `ADMIN_SAVE_INGESTION_OPS`.

**Web:** `apps/web/src/features/admin/{shell,resources/save-matching}` + `AdminResource`; rutas Vike
`/admin` gateadas server-side; TanStack Table server-side + filtros en URL; compare con diff;
hotkeys de teclado.

**Riesgos:** SSRF en `TestSource` (https-only + rechazo IPs privadas/loopback) · hook de detección de
ruptura quizá no exista (verificar en 3.17) · cardinalidad provider↔registry 1:1 (confirmar en 3.1) ·
`claude_judge` debe RETORNAR el usage (no solo loguear).

---

## 4. Checklist de tareas — 76 tareas / 4 fases (Strict TDD, RED-first)

> Cada fase es shippeable por sí sola. La tarea **1.7 (regresión del FK) es el RED de mayor prioridad**
> — falla contra el `resolve_review` de hoy.

### Fase 1 — Data-shape + backend core *(ships: API testeada, sin UI)* — 26 tareas
- [ ] 1.1 Migración: `store_product` + name/brand/size_text/image_url (nullable)
- [ ] 1.2 Migración: `product_match` + reason_code/reason_note/judge_*_tokens/judge_model (nullable)
- [ ] 1.3 Migración: crear `review_candidate` (FK CASCADE, unique(match,canonical), cap top-5 en código)
- [ ] 1.4 Migración: `provider` + logo_url (nullable, paste-URL)
- [ ] 1.5 Migración: crear `store_registry` (provider_id UNIQUE 1:1, platform/base_url/endpoints/headers/auth jsonb, health_status/paused_at)
- [ ] 1.6 Migración: crear `basket_query` (market_id/category_label/query_text/position/active, unique)
- [ ] 1.7 **[RED, integración] Regresión FK: `ResolveReview` escribe FK + product_match en UNA tx** (approve/reject/rollback) — DEBE fallar primero
- [ ] 1.8 [GREEN] `ResolveReview` (patrón tx de `_auto_link`); reject exige reason_code
- [ ] 1.9 [RED, integración] `record_observation` persiste raw name/brand/size_text/image_url
- [ ] 1.10 [GREEN] Cablear campos de `RawCatalogEntry` por `refresh_prices.py`
- [ ] 1.11 [RED, integración] pending_review persiste top-5 `review_candidate` por score; auto-linked ninguno; cap >5
- [ ] 1.12 [GREEN] Persistencia de candidatos en `MatchStoreProduct._to_review`
- [ ] 1.13 [RED, unit] `claude_judge._log_token_usage` RETORNA dict de usage (no solo loguea)
- [ ] 1.14 [GREEN] Retornar usage; cablear columnas de costo en `product_match` vía `record_match`
- [ ] 1.15 [RED, integración] `CreateCanonicalAndLink` crea canonical (slug autogen) + enlaza vía ResolveReview
- [ ] 1.16 [GREEN] `CreateCanonicalAndLink`
- [ ] 1.17 [RED, integración] `ListReviewQueue` orden incertidumbre + FIFO override + filtros + paginación
- [ ] 1.18 [GREEN] `ListReviewQueue`
- [ ] 1.19 [RED, integración] `GetReviewDetail` raw attrs + candidatos; estado sin-candidatos para filas legacy (sin error)
- [ ] 1.20 [GREEN] `GetReviewDetail`
- [ ] 1.21 `CapabilityKey.ADMIN_SAVE_MATCHING_REVIEW` + `ADMIN_SAVE_INGESTION_OPS`, seed a SUPER_ADMIN
- [ ] 1.22 [RED, RBAC] non-admin 403 en cada `/admin/save/*`; SUPER_ADMIN 200/201
- [ ] 1.23 [GREEN] `admin_save.py` (thin, `require_capability` en cada ruta): list/detail/resolve/create-canonical
- [ ] 1.24 [RED, integración] bulk resolve por-fila atómico, fallo parcial reportado
- [ ] 1.25 [GREEN] endpoint/use-case bulk-resolve
- [ ] 1.26 `make openapi` (tras 1.23/1.25)

### Fase 2 — Shell web + UI de la cola *(gate: contrato de Fase 1)* — 25 tareas
- [ ] 2.1 `admin-resource.ts` (`AdminResource` + `ADMIN_RESOURCES[]`, 1 entrada: matching-review)
- [ ] 2.2 `require-admin.ts` (chequeo de capability server-side)
- [ ] 2.3 `AdminLayout.tsx` (nav filtrada por capability)
- [ ] 2.4 `pages/admin/+guard.ts` (gate server-side anidado, 403)
- [ ] 2.5 [RED, vitest] root `+guard.ts` early-return para `/admin/*` (sin redirect locale/país)
- [ ] 2.6 [GREEN] exención + excluir `/admin/*` del sitemap
- [ ] 2.7 [RED, vitest] `confidence-color.ts` banding (fn pura)
- [ ] 2.8 [GREEN] `lib/confidence-color.ts`
- [ ] 2.9 [RED, vitest] `field-diff.ts` casefold+trim compare
- [ ] 2.10 [GREEN] `lib/field-diff.ts`
- [ ] 2.11 `pages/admin/review-queue/+data.ts` (SSR api-client, URL params → filtros/orden/paginación)
- [ ] 2.12 [RED, vitest] `ReviewQueueListScreen` orden incertidumbre + color-coded
- [ ] 2.13 [GREEN] `ReviewRow.tsx` + `ReviewQueueListScreen.tsx`
- [ ] 2.14 [RED, vitest] filtros round-trip por URL (link compartible)
- [ ] 2.15 [GREEN] filtros/paginación → URL search params + Vike navigation
- [ ] 2.16 `pages/admin/review-queue/@id/+data.ts` (SSR detalle: raw attrs + candidatos)
- [ ] 2.17 [RED, vitest] `CompareDiff` estilos match/differ por campo
- [ ] 2.18 [GREEN] `CompareDiff.tsx`
- [ ] 2.19 [RED, vitest] `ReasonCodeSelect` bloquea reject sin motivo
- [ ] 2.20 [GREEN] `ReasonCodeSelect.tsx` + mutaciones resolve/create-canonical (token async Clerk) + refresh
- [ ] 2.21 [RED, vitest] `useKeyboardReview` approve/reject/next por hotkeys
- [ ] 2.22 [GREEN] `useKeyboardReview.ts` en `ReviewDetailScreen`
- [ ] 2.23 [RED, vitest] bulk-select + bulk action → llamadas por-fila, fallo parcial visible
- [ ] 2.24 [GREEN] bulk-select UI + wiring a 1.25
- [ ] 2.25 [manual] Verificar en dev: lista → detalle → resolver → siguiente

### Fase 3 — Ops de ingesta *(backend paralelo a Fase 2; web sobre el shell de Fase 2)* — 19 tareas
- [ ] 3.1 **[checkpoint]** confirmar provider↔store_registry 1:1 para B1
- [ ] 3.2 [RED, integración] Create/Update Provider + SetProviderLogo(logo_url)
- [ ] 3.3 [GREEN] provider CRUD + rutas; `make openapi`
- [ ] 3.4 [RED, vitest] form de provider (paste logo_url) + home renderiza imagen no badge
- [ ] 3.5 [GREEN] pantalla Providers
- [ ] 3.6 [RED, integración] Create/Update/Pause/Resume Source CRUD sobre `store_registry`
- [ ] 3.7 [GREEN] source use-cases + `CatalogSourceFactory.build(platform, base_url, endpoints, headers, auth)`
- [ ] 3.8 [RED, adapter-mock] `TestSource` llama `record_observation`/`match_repo` CERO veces
- [ ] 3.9 [RED, adapter-mock] `TestSource` SSRF: rechaza IPs privadas/loopback/link-local, https-only, cap size/timeout
- [ ] 3.10 [GREEN] `TestSource` (islice(fetch,10), SSRF pre-connect); `make openapi`
- [ ] 3.11 [RED, vitest] "Probar" muestra muestra o error, sin persistir
- [ ] 3.12 [GREEN] pantalla Sources + Probar
- [ ] 3.13 [RED, integración] basket_query CRUD
- [ ] 3.14 [GREEN] basket-query use-cases + endpoints
- [ ] 3.15 Migración de datos: backfill de las 213 `BASKET_QUERIES` a `basket_query`
- [ ] 3.16 [GREEN] editor web de basket-query
- [ ] 3.17 **[investigar]** confirmar si existe hook de detección de ruptura en el pipeline; documentar antes de 3.18
- [ ] 3.18 [RED, integración] health badge = frescura+error-rate+ruptura (o manual-pause-only según 3.17)
- [ ] 3.19 [GREEN] health_status/auto-pause (o manual-pause fallback) + badge web

### Fase 4 — Observabilidad *(gate: columnas de costo pobladas)* — 6 tareas
- [ ] 4.1 [RED, integración, data-dependent] `GetMatchingMetrics` auto-link rate + queue-size + %-to-judge (distribución seedeada)
- [ ] 4.2 [RED, integración, data-dependent] costo/latencia del juez `percentile_cont(0.5/0.95/0.99)` sobre distribución sesgada
- [ ] 4.3 [RED, integración] run con cero llamadas al juez → estado "no judge calls", no blank/cero
- [ ] 4.4 [GREEN] `GetMatchingMetrics` + ruta metrics; `make openapi`
- [ ] 4.5 [RED, vitest, data-dependent] pantalla renderiza p50/p95/p99, nunca solo promedio
- [ ] 4.6 [GREEN] `MatchingMetricsScreen` + entrada de nav

## 5. Dependencias cruzadas
- Fase 2 gate total en la API de Fase 1 (`make openapi` 1.26 primero).
- Fase 3 web (3.4/3.5/3.11/3.12/3.16/3.19) gate en el shell de Fase 2; Fase 3 backend puede correr en paralelo con Fase 2.
- Fase 4 gate en las columnas de costo (1.14) pobladas; prefiere la nav de Fase 2/3.
- 3.17 (hook de ruptura) y 3.1 (cardinalidad) son checkpoints bloqueantes de su alcance.

## 6. Comandos
```bash
cd apps/api && uv run pytest tests/save tests/ingestion -q   # backend (needs make db-up)
cd apps/api && uv run alembic upgrade head                    # migraciones
make openapi                                                  # tras cada batch de endpoints admin
cd apps/web && pnpm test                                      # web (vitest)
```

## 7. Siguiente paso
`sdd-apply` por **Fase 1** (empezando por 1.7, el RED del FK). Commit por batch, un gate entre fases.
