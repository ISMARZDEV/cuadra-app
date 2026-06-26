# 🗂️ Cuadra — Estructura del monorepo

> **Deriva de** [`arquitectura-mvp.md`](./arquitectura-mvp.md) (el padre). Traduce sus decisiones
> (hexagonal + **screaming**, router-a-nodos, ingesta modular, delivery plane, Alembic/SQLAlchemy,
> offline-first) a carpetas reales. Cada folder se anota con su ADR/sección de origen.
>
> **Decisión base (confirmada):** backend **context-first / screaming** (§4) — las carpetas gritan el
> **dominio**, no el framework. `ledger` vive dentro de `insights/domain`. Corrige los dos hallazgos
> del proyecto de reuso (§17.2): layer-first y capa agéntica fuera de `src/`.
>
> **Fecha:** 2026-06-25.

---

## 1. Raíz del monorepo

```
cuadra/
├── apps/
│   ├── mobile/                 # React Native + Expo (TS) · §9
│   └── api/                    # Python · FastAPI · LangGraph · §9
├── packages/                   # compartido (lado JS/TS)
│   ├── api-client/             # cliente TS generado desde OpenAPI · ADR 24
│   ├── shared-types/           # DTOs Pydantic → TS (contrato único)
│   └── config/                 # tsconfig · eslint · prettier compartidos
├── infra/
│   ├── docker/                 # Dockerfiles + docker-compose (dev)
│   ├── ci/                     # GitHub Actions (lint·typecheck·tests·evals·migrate·deploy) · ADR 23/27
│   └── env/                    # plantillas dev/staging/prod (secrets fuera del repo) · ADR 27
├── docs/                       # esta carpeta startup/ + research/ (arquitectura, concepto, etc.)
├── pnpm-workspace.yaml         # workspaces JS (mobile + packages)
├── turbo.json                  # (opcional) cache de tareas JS — solo si el lado JS crece
├── Makefile · .env.example · README.md
```

> **Tooling:** **pnpm workspaces** (JS) + **uv** (Python en `apps/api`). **Turborepo** opcional, no
> bloqueante para el MVP. **NO Nx** (sobra para un mixto Python/TS con un solo app JS).

---

## 2. `apps/api` — backend (hexagonal + screaming + Clean)

```
apps/api/
├── pyproject.toml · uv.lock · alembic.ini
├── migrations/                 # Alembic · ADR 27/31
│   ├── env.py
│   └── versions/
├── seeds/                      # data seed idempotente · §11
│   ├── market_rd.py            #   Market RD activo (DOP/USD, locale es-DO) · ADR 13
│   ├── categories.py           #   categorías de Insights
│   └── save_taxonomy.py        #   taxonomía canónica de Save · §6.2
├── src/
│   ├── main.py                 # FastAPI app factory
│   │
│   ├── api/                    # ── PRESENTACIÓN (HTTP/WS) · ADR 24 ──
│   │   ├── composition_root.py # wiring de DI: puertos → adaptadores
│   │   ├── v1/
│   │   │   └── controllers/    # uno por contexto (identity, insights, save, news, chat, me, subscription)
│   │   ├── ws/                 # streaming del chat (SSE/WebSocket) · §7.6
│   │   └── middleware/         # JWT+claims · idempotency-key · rate-limit · errores · §12.1, E.7
│   │
│   ├── contexts/               # ── BOUNDED CONTEXTS (screaming) ──
│   │   ├── identity/           # roles · capabilities · suscripción · ADR 4
│   │   │   ├── domain/         #   entities · value_objects · ports · enums   (PURO, sin ORM · ADR 31)
│   │   │   ├── application/    #   use_cases · dtos · mappers
│   │   │   └── infrastructure/ #   repos SQLAlchemy · adapters (Supabase/Clerk)
│   │   │
│   │   ├── insights/           # wallets · transacciones · presupuesto · perfil financiero
│   │   │   ├── domain/
│   │   │   │   ├── ledger/      #   doble entrada · minor units (BIGINT) · FX fechado · ADR 14, §12·B
│   │   │   │   ├── entities/    #   wallet · transaction · budget · savings_goal · space
│   │   │   │   └── ports/
│   │   │   ├── application/     #   safe_to_spend · métricas (tools determinísticas · §7.3)
│   │   │   └── infrastructure/  #   repos · perfil financiero precomputado (store · §7.9)
│   │   │
│   │   ├── save/               # catálogo de precios · matching · listas
│   │   │   ├── domain/  
│   │   │   ├── application/
│   │   │   └── infrastructure/
│   │   │       ├── catalog_sources/   # CatalogSource: VtexAdapter · HtmlScraperAdapter · §6.2
│   │   │       └── matching/          # EAN → fuzzy(pg_trgm) → embeddings(pgvector) · §6.2
│   │   │
│   │   ├── news/               # feed masonry · fuentes (oficial IA · admin) · §8
│   │   │   ├── domain/  application/  infrastructure/
│   │   │
│   │   └── aispace/            # ── ORQUESTADOR LangGraph: patrón Router (router-a-nodos) · §7.1 ──
│   │       ├── graph.py        #   StateGraph (Graph API) · ADR 2
│   │       ├── state.py        #   custom reducers (anti-stale) · §7.2
│   │       ├── router/         #   cortocircuitos + structured_output(Literal) · §7.8
│   │       ├── agents/         #   NODOS especializados
│   │       │   ├── finance/    #   {agent.py · tools/ · prompts/}
│   │       │   ├── purchases/
│   │       │   ├── coach/      #   fan-out del triángulo (Insights × Save) · §7.1
│   │       │   └── support/    #   RAG/FAQ
│   │       ├── handoff/        #   select_new_agent (patrón Handoffs) · ADR 30
│   │       ├── hitl/           #   interrupt() + pending_action (HITL unificado) · ADR 30
│   │       └── memory/         #   checkpointer Postgres + memoria semántica (pgvector) · §7.5
│   │
│   ├── ingestion/             # ── INGESTA MODULAR tras puertos (NO monolito) · ADR 29 ──
│   │   ├── ocr/               #   OCRPort + ClaudeVisionAdapter + parser determinístico · ADR 8
│   │   ├── stt/               #   STTPort (dictado nativo on-device / Whisper fallback) · §7.7
│   │   ├── enrichment/        #   detrás de interfaz (las capas ML entran sin reescribir) · §5.6
│   │   │   ├── classifier/    #     swiss-cheese: rule → catálogo → (ML futuro)
│   │   │   └── confidence/    #     scorer puro + pesos por país (offline→neutro)
│   │   └── sources/           #   MovementSource: voice · chat · ocr  (correo = Fase 1)
│   │
│   ├── platform/             # ── DELIVERY PLANE · §12·E ──
│   │   ├── billing/          #   IAP + RevenueCat (entitlements server-side) · ADR 25
│   │   ├── notifications/    #   orquestador push (scheduling · quiet-hours · dedupe) · ADR 26
│   │   ├── outcomes/         #   substrato acción→resultado real · ADR 22/28
│   │   ├── observability/    #   LangSmith (agente) + Sentry (errores) + PostHog (funnel) · ADR 28
│   │   └── jobs/             #   scheduler (Inngest/Temporal/cron): scrapers Save · agente proactivo
│   │
│   └── shared/               # ── KERNEL transversal ──
│       ├── money/            #   minor units · aritmética segura · FX · §12·B
│       ├── market/           #   Market/jurisdicción — puertos por país · ADR 13
│       ├── llm/              #   LLMPort (Haiku/Sonnet/Opus) + prompt caching · §7.8
│       ├── db/               #   engine · session · base · pgvector · search_path por schema/contexto (§6)
│       └── result/ errors/ ids/ clock/
│
└── tests/                    # ── ADR 23 ──
    ├── unit/                 #   tools · ledger · normalización/matching · clasificador
    ├── integration/          #   API · checkpointer · sync/idempotencia · §12·C
    ├── e2e/                  #   gasto por voz · comparar precios · HITL
    └── evals/                #   golden-set + LLM-as-judge del agente (router · tool-selection)
```

### Reglas del backend (no negociables)
- **`domain/` es PURO** — dataclasses/Pydantic, **cero SQLAlchemy**; el ORM vive solo en
  `infrastructure/` (ADR 31). El dominio nunca importa de infraestructura.
- **Todo lo que varía por país** vive tras un puerto resuelto por `shared/market` (ADR 13).
- **Aislamiento de datos (UNIVERSAL):** **ningún contexto accede a la DB de otro** — solo por su
  `application/` service (in-process hoy → red mañana). Aplica a TODOS los contextos, `aispace`
  incluido. Reforzado por **schema + rol de DB por contexto** y `import-linter` (ver §6, ADR 33).
- **`ingestion/` y `platform/` son transversales** (no son contextos de negocio) → carpetas propias.
- **El LLM nunca hace aritmética** (§7.3): los números salen de `application/` (tools determinísticas);
  el agente solo redacta y propone.

### Workflow de DB / migraciones (NO hay `db_init` monolítico)

> El schema vive en los **models SQLAlchemy** (`infrastructure/` de cada contexto); **Alembic genera**
> las migraciones por diff. **Nunca se escribe DDL a mano.** Reemplaza el `db_init_pg.py` del reuso
> (schema + seed en ~1.2K líneas de SQL crudo con `IF NOT EXISTS`) · ADR 27/31.

**Crear la BD desde cero** (esto reemplaza `python db_init_pg.py`):
```bash
alembic upgrade head      # aplica todas las migraciones en orden → schema completo
python -m seeds           # seed (market RD, categorías, taxonomía Save)   ·   o: make db-reset
```

**Agregar una tabla o un campo:**
1. Editas el **model** en `src/contexts/<ctx>/infrastructure/models.py` (+ la entidad PURA en
   `domain/` y el mapper si es concepto de dominio · ADR 31). Nunca escribes DDL.
2. `alembic revision --autogenerate -m "msg"` → genera la migración en `migrations/versions/`.
3. **Revisas** el archivo generado (siempre).
4. `alembic upgrade head` → aplica.

**Caso especial — renames:** el autogenerate los ve como *drop + add* (perdería datos) → editas la
migración a `op.alter_column(..., new_column_name=...)`. Único momento en que tocas la migración a mano.

**Cheat-sheet:**
```bash
alembic upgrade head                       # crear / poner al día la BD
alembic revision --autogenerate -m "msg"   # generar migración desde cambios en los models
alembic downgrade -1                        # revertir la última (no existía con db_init)
alembic current  ·  alembic history         # versión actual / historial
```

> **Por qué:** una sola fuente de verdad (los models) · historial versionado en git con up/down ·
> **cero drift** (dev/staging/prod corren la misma cadena) · CI aplica `alembic upgrade head` antes
> de deploy. El `IF NOT EXISTS` del monolito no podía actualizar tablas existentes → por eso el reuso
> necesitaba `tools/migrate_*.py` aparte (doble fuente de verdad). Alembic lo unifica.

---

## 3. `apps/mobile` — Expo (feature-first + atomic + offline-first)

```
apps/mobile/
├── app/                       # Expo Router (file-based) · §9
│   ├── (auth)/                #   login · onboarding (con insight inmediato · §7.10)
│   ├── (tabs)/                #   News · Insights · AISpace · Save · Config · §3.1 default-person/ accountant/ influencer/ provider/ super-admin/
│   │   └── _layout.tsx        #   tab bar (chat AISpace al centro)
│   │   └── api/  ws/         #   cliente (packages/api-client) + streaming del chat  
│   │       └── services/     # routes  
│   └── _layout.tsx
├── src/
│   ├── public/
│   │   ├── dark/  
│   │   ├── light/ 
│   │   ├── img/  
│   │   ├── logos/  
│   │   └── svg/
│   ├── test/
│   ├── auth/
│   ├── features/             # FEATURE-FIRST (container/presentational)  #   {components · hooks · api · store · types · Intefaces· enums}
│   │   ├── insights/        
│   │   ├── save/  
│   │   ├── aispace/  
│   │   ├── news/  
│   │   ├── auth/  
│   │   └── subscription/
│   ├── components/           # UI atómica compartida (atoms · molecules · organisms)
│   │   ├── charts/           #   Reanimated + Skia (anillo · ruleta) · §9
│   │   ├── feedback/ 
│   │   ├── forms/ 
|   |   ├── feedback/ 
│   │   └── ui/ 
│   │       ├── buttons/
│   │       ├── inputs/
│   │       ... etc
│   ├── shared/ 
│   │   ├── interfaces/ 
|   |   ├── enums/ 
|   |   ├── api/ 
│   │   └── types/ 
│   ├── lib/
│   │   ├── hooks/
│   │   ├── types/
│   │   ├── utils.ts
│   │   ├── offline/         #   PowerSync/WatermelonDB + cola + idempotency-key · §12·C, ADR 16
│   │   └── stt/             #   dictado nativo on-device · §7.7
│   ├── store/                # Zustand · §9
│   ├── theme/                # light and dark theme
│   └── i18n/                 # es-DO (multipaís listo)
├── assets/
├── app.json · eas.json       # EAS Build/Submit · §9
├── tsconfig.json · package.json
└── tests/                    # Vitest (unit) + Playwright/Maestro (e2e)
```

---

## 4. `packages/` e `infra/`

```
packages/
├── api-client/      # generado desde el OpenAPI del backend (un solo contrato, sin drift) · ADR 24
├── shared-types/    # tipos/DTO compartidos (Pydantic → TS)
└── config/          # tsconfig · eslint · prettier base

infra/
├── docker/          # Dockerfile (api) · docker-compose (Postgres+pgvector, dev)
├── ci/              # GitHub Actions: lint · typecheck · import-linter · tests · evals · alembic · deploy · ADR 23/27
└── env/             # plantillas por entorno (dev/staging/prod); secrets en gestor, NO en repo · ADR 27
```

### Pipeline del contrato API — `packages/api-client` (OpenAPI → cliente generado)

> Es la **única frontera `mobile ↔ api`**. Se automatiza desde el día 1 para que el split de repos
> (§6) sea **publicar un paquete**, sin refactor. Herramienta: **`@hey-api/openapi-ts`** (plugin
> nativo de **TanStack Query** · §9; recomendado por la doc oficial de FastAPI).

```
apps/api (FastAPI)               packages/api-client                  apps/mobile
Pydantic + routes ──emite──► openapi.json ──genera──► SDK + hooks TanStack Query ──► useGetBalanceQuery()
   (response_model)            (@hey-api/openapi-ts)     (@cuadra/api-client)
```

**Setup (paquete PUBLICABLE desde hoy — esa es la clave del split):**
```jsonc
// packages/api-client/package.json
{ "name": "@cuadra/api-client", "version": "0.1.0", "scripts": { "generate": "openapi-ts" } }
// apps/mobile/package.json
"dependencies": { "@cuadra/api-client": "workspace:*" }   // hoy workspace  →  mañana "^1.x"
```
```ts
// packages/api-client/openapi-ts.config.ts
import { defineConfig } from '@hey-api/openapi-ts';
export default defineConfig({
  input: '../../apps/api/openapi.json',                 // o http://localhost:8000/openapi.json
  output: 'src/generated',
  plugins: ['@hey-api/client-fetch', '@tanstack/react-query', 'zod'],
});
```

**Flujo dev:** cambias el backend → `make openapi` (vuelca el spec + regenera) → el **typecheck del
mobile marca en rojo** cualquier breaking change. El contrato se vuelve un **test de compilación**.

**Guardia anti-drift (CI)** — regenera el cliente y falla si quedó desactualizado:
```bash
pnpm openapi:dump && pnpm --filter @cuadra/api-client generate
git diff --exit-code packages/api-client/src/generated   # ⛔ falla si hay diff
```
Garantiza que el cliente committeado **siempre** coincide con el backend (imposible desincronizar).

**Disciplina del backend** (contrato bueno = cliente bueno): `response_model` en todos los endpoints ·
`tags` por contexto · `operation_id` estables · versionado `/v1` (ADR 24).

**Split de repos = 1 línea:** `pnpm publish` del paquete desde el repo backend en cada release; el
frontend cambia `workspace:*` → `^1.x`. **Nada de dominio se toca** (§6).

---

## 5. Trazabilidad carpeta → decisión

| Carpeta | Decisión |
|---|---|
| `src/contexts/*` (context-first) | §4 screaming · corrige §17.2 (layer-first) |
| `contexts/aispace/{router,agents,handoff,hitl,memory}` | §7.1 router-a-nodos · ADR 30 · §7.5 |
| `contexts/insights/domain/ledger` | ADR 14 · §12·B (minor units + doble entrada) |
| `ingestion/*` (modular tras puertos) | ADR 29 · §5.6 · §7.7 · ADR 8 |
| `platform/*` (delivery plane) | §12·E · ADRs 25–28 |
| `shared/market` | ADR 13 (Market de 1ra clase) |
| `migrations/` + `infrastructure/` repos | ADR 27/31 (Alembic + SQLAlchemy) |
| `tests/evals` | ADR 23 (eval harness del agente) |
| `mobile/src/lib/offline` | §12·C · ADR 16 (offline-first) |
| `mobile/src/lib/stt` | §7.7 (STT on-device) |
| schema + rol de DB por contexto · referencia por ID · `import-linter` | §6 · ADR 33 (microservices-ready) |
| `packages/api-client` (OpenAPI → `@hey-api/openapi-ts` + TanStack Query) | ADR 24 · §4 pipeline del contrato · §6 split |

## 6. Preparado para microservicios y split de repos

> Es un **monolito modular** (lo correcto para el MVP — *"monolith first"*; Shopify/Notion volvieron
> a esto en 2025). Los **bounded contexts son las costuras** de futura extracción. Estas reglas las
> mantienen **enforceables, no aspiracionales** (ADR 33).

### Aislar la DATA (lo que más cuesta separar después)
- **Schema Postgres por contexto:** `identity.*` · `insights.*` · `save.*` · `news.*` · `aispace.*`
  · `platform.*`. Cada uno con un **rol de DB** acotado a su schema (`insights_role` **no puede**
  `SELECT` el schema `identity`) → el límite lo impone la **DB**, no solo la buena voluntad.
- **Cross-context = referencia por ID (UUID), NUNCA FK.** Un FK no cruza schemas limpio; `user_id`
  es un UUID que el servicio confía del JWT. FKs **solo dentro** del mismo contexto.
- **Sin JOINs cross-context.** Leer otro contexto = su `application` service, o una **vista
  read-only** que ese contexto publique como "API de datos".

### Aislar el CÓDIGO
- **`import-linter`** (en CI) prohíbe que un contexto importe de otro salvo por puertos/contratos.
- **`shared/` mínimo y estable** (`money · result · ids · clock`) — es el futuro paquete publicado;
  `market`/`llm` se vigilan para que no se vuelvan acopladores.
- **`aispace` depende de puertos que ÉL define** (consumer-driven); Insights/Save proveen el adaptador.

### Split de repos (front ↔ back) — ya es fácil
- Única frontera = **contrato OpenAPI** + `packages/api-client` generado. Separar = **publicar
  `api-client`** como paquete versionado desde el repo backend; el frontend lo consume. **Cero refactor.**

### Orden de extracción (solo con presión real: escala / equipo / deploy)
1. `ingestion` (OCR/STT, bursty) · `save/jobs` (scrapers) → workers.
2. `platform/billing` · `platform/notifications` (ya aislados).
3. `save` (escala distinta: catálogo + matching).
4. `identity` queda central (auth); `aispace` = gateway/BFF.

> Extraer un servicio = mover `contexts/<x>/` + su slice de migraciones (su schema) + cambiar las
> llamadas in-process por HTTP. **Mecánico, no traumático — porque la data ya estaba aislada.**

---

> **Nota de IP:** se reusan **patrones**, no código. Esta estructura **mejora** la del proyecto de
> reuso: context-first (no layer-first) y capa agéntica DENTRO de la arquitectura (no legacy aparte).
