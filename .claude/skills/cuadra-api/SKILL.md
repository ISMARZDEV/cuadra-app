---
name: cuadra-api
description: >
  Conventions + stack for Cuadra's backend (apps/api): FastAPI + SQLAlchemy + Alembic + Postgres/
  pgvector + LangGraph, structured as hexagonal bounded contexts (Clean/DDD, screaming). Covers
  the layer rules (domain PURE / application / infrastructure), ports as Protocols, composition-root
  DI, money in minor units, multi-country via shared/market, schema-per-context isolation (ADR 33,
  enforced by import-linter), the Alembic workflow, contract-first api-client, and Strict TDD.
  Trigger: Writing or editing anything under apps/api — entities, use-cases, repos, endpoints,
  migrations, ports/DTOs, the shared kernel, or backend tests. Also owns the schema-integrity rules
  (§4b): keeping `alembic check` green, which FKs deserve an index, derived columns via trigger,
  cycle guards on self-FK trees, and where an invariant belongs — the source that writes it, not
  always the table.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.2"
---

> **Your role:** a backend architect with 15+ years in Clean/Hexagonal/DDD, event-sourced ledgers,
> and multi-tenant fintech. This is a **regulated fintech** — money is BIGINT minor units, the
> domain is pure, contexts are isolated, and every rule below is enforced by a tool in CI. You do
> not "just make it pass" — you keep the architecture enforceable. Strict TDD is on: RED → GREEN → REFACTOR.

> **Compose — don't duplicate.** Domain knowledge of Save lives in `cuadra-save`; the LangGraph
> agent in `cuadra-agent-prompts` (+ the global `langgraph` skill); branch/PR/CI in
> `cuadra-git-workflow`; the API contract → frontend in `cuadra-web`/`cuadra-mobile`. THIS skill
> owns the backend's structural + money + testing conventions. Deep design: `docs/arquitectura-mvp.md`,
> `docs/estructura-monorepo.md` §2.

> **Research the state of the art FIRST (2025-2026) — a standing priority, not an afterthought.**
> Before building or choosing anything non-trivial (a library, pattern, architecture, or
> security-sensitive flow), do NOT code from memory. Investigate and be CRITICAL: current official
> docs, high-signal GitHub repos, papers, engineering blogs and forums, and **how successful
> projects with strong architectures solve it** — plus the security angle (OWASP / known CVEs for
> anything touching auth, money, PII, or external input). Compare options with honest trade-offs,
> verify claims (versions, benchmarks, maintenance), prefer the recent + maintained, and flag
> anything unverified as "to verify", never as fact. Grounded decisions over confident guesses —
> the base for working excellently. Use web search / fetch the real docs; don't assume.

## When to Use

- Adding/editing an **entity, value object, use-case, port, DTO, mapper, repo, or endpoint**.
- Writing an **Alembic migration** or changing the `save`/`insights`/`identity`/`news` schema.
- Touching the **shared kernel** (`money`, `market`, `db`, `result`, `ids`, `clock`, `llm`).
- Writing **backend tests** (unit / integration).

## Critical Patterns

### 1. Hexagonal bounded contexts (screaming; ADR 31 + ADR 33)

```
src/
├── main.py · config.py · openapi_dump.py · observability.py
├── api/                      # PRESENTATION: controllers (v1/controllers/<ctx>.py), composition_root.py (DI), middleware
├── contexts/<ctx>/           # identity · insights · save · news · aispace (orchestrator)
│   ├── domain/               #   PURE: entities/ · ports/ (Protocols) · value_objects · <domain>.py  — NO SQLAlchemy
│   ├── application/          #   use-cases (one class, .execute()) · dtos.py (Pydantic) · mappers.py · errors.py
│   └── infrastructure/       #   models.py (SQLAlchemy) · repositories.py · mappers.py · adapters (catalog_sources/, matching/)
├── ingestion/                # Dagster module (transversal, not a context) — see cuadra-save
├── platform/                 # delivery plane (billing, notifications, jobs, observability)
└── shared/                   # KERNEL: money · market · db · result · ids · clock · llm · errors · i18n · lang
```

**Enforced in CI by `import-linter` (`.importlinter`) — these are not suggestions:**
- **`domain/` is PURE** — dataclasses/Pydantic, **zero SQLAlchemy**; the ORM lives ONLY in
  `infrastructure/`. `domain` NEVER imports `infrastructure` (`type = forbidden`).
- **Business contexts are INDEPENDENT** — `identity`/`insights`/`save`/`news` do NOT import each
  other (`type = independence`). Cross-context = by UUID reference (no FK across schemas), read via
  the other context's `application` service. `aispace` is the orchestrator (consumes by port).
- Run locally: `uv run lint-imports`. A violation fails CI — fix the boundary, don't suppress it.

### 2. Ports & DI (dependency inversion)

- **Ports are `typing.Protocol`** (structural interfaces) in `domain/ports/`. Use-cases depend on the
  port; `infrastructure/` provides the `Sql*Repository` adapter. The domain never names a concrete repo.
- **Wiring lives in `api/composition_root.py`**: `get_<usecase>(session = Depends(get_session))`
  factory functions build a use-case with its repos. `get_session()` is the **Unit of Work** (one
  session per request, transactional). Controllers are THIN: parse request → `Depends(get_<usecase>)` → return DTO.
- A **use-case** is one class with `.execute(...)` returning a DTO; it orchestrates repos + domain,
  never touches HTTP or ORM directly.

### 3. Money — minor units, always (§12·B — SACRED)

- `shared/money`: `Money(amount_minor: int, currency: Currency)`. `amount_minor` MUST be `int`
  (the ctor rejects float/bool). Arithmetic is integer (`__add__` etc.); currency mismatch raises.
- **NEVER float/double for money.** DB columns are `BIGINT` minor units. Convert to major only at the
  edge (display). The AI/LLM NEVER computes a price — numbers come from the DB as integers (see `cuadra-save`).
- Multi-country: everything that varies by jurisdiction sits behind `shared/market` (ADR 13);
  `market_id` is carried by ID (`"DO"`), not hardcoded.

### 4. Alembic — the schema workflow (NO hand-written DDL)

Schema lives in the SQLAlchemy models (`infrastructure/models.py`); Alembic generates migrations by diff.
1. Edit the **model** (+ the PURE entity in `domain/` and the mapper, if it's a domain concept).
2. `uv run alembic revision --autogenerate -m "ctx: msg"` → generates in `migrations/versions/`.
3. **REVIEW the generated file ALWAYS.** Autogenerate can propose dropping unrelated tables — clean it.
4. `uv run alembic upgrade head` (needs the DB up: `make db-up` / cuadra-db on :5433).
- **Hand-edit the migration** for: **renames** (`op.alter_column(new_column_name=...)`, else it's a
  destructive drop+add), **backfills**, and **data migrations** (add column nullable → backfill →
  add constraint → set NOT NULL). Integration tests run against the REAL DB, so the migration must be
  APPLIED before they pass.

### 4b. Schema integrity — what the DB must enforce, and what it must NOT

*(Every rule below was paid for on 2026-08-04. Each one is a bug that produced **no error**.)*

**`alembic check` must stay GREEN — it is the drift detector, and a check that always fails is a
check that is off.** It ran red permanently because two indexes existed in the DB but not in the
model metadata (`uq_brand_market_key`, an EXPRESSION index for accent-insensitive brand dedup;
`ix_provider_market_active`, a PARTIAL index). Autogenerate proposed dropping them on every run, and
five separate migrations had to delete that proposal **by hand**. The noise buried the signal — no
one could tell a false positive from real drift.
- **Declare every hand-made index in `__table_args__`**, even the ones the ORM never queries through:
  `Index("name", "col", text("expr"), unique=True)` for expression indexes, `postgresql_where=text(...)`
  for partial ones. If it genuinely cannot be modelled, add it to `_UNMANAGED_INDEXES` in
  `migrations/env.py` — never leave it silently drifting.
- `migrations/env.py::include_object` already excludes objects outside the managed schemas (LangGraph's
  `public.checkpoint*`, spikes). That filter is deliberate: **do not "fix" a red check by deleting what
  autogenerate wants to drop without reading what it is.** Losing an HNSW/trgm index breaks nothing
  visibly — the query degrades to a sequential scan and keeps "working". It lies in green.
- Guarded by `tests/shared/integration/test_schema_matches_models.py`.

**Index the FKs you QUERY — not all of them.** An audit found 12 unindexed FKs. Only three were
indexed, chosen by counting real query sites in `src/` per model attribute
(`canonical_product.taxonomy_node_id` 10, `canonical_product.brand_id` 13,
`product_match.canonical_product_id` 4). The other nine appear in **zero** queries — they would only
help a DELETE cascade, which here is maintenance, **and every index is paid on every INSERT**.
Ingestion is write-heavy: indexing "just in case" slows down the thing you do most. Create them while
the table is empty (instant); on a large table you need `CONCURRENTLY` and a window.

**A DERIVED column needs a trigger, not discipline.** `taxonomy_node.level` is the depth in the
`parent_id` chain — denormalised on purpose (the classifier filters `level == 1` in hot queries), but
nothing forced it to be true. A trigger now **computes** it from the parent instead of trusting the
caller, and propagates it to descendants on re-parent. *A derived value is not believed, it is derived.*

**An adjacency list (self-FK tree) needs a cycle guard.** Verified: setting a root as the child of its
own child was accepted, the tree went 17 roots → 16, and `ancestors()` (`while current is not None`)
**never terminates** — a hang, not an exception, which is the worst failure mode there is. The guard
trigger also carries a hop cap, because without it the cycle check would hang exactly like the code it
protects.

**Enforce an invariant where it is WRITTEN, not where it is stored.** Tightening
`uq_taxonomy_parent_name` to `UNIQUE NULLS NOT DISTINCT` (Postgres lets duplicate roots through
because each NULL counts as distinct) broke **41 tests across 13 files** — and the tests were not
wrong: the tree is GLOBAL, so table-level name uniqueness makes isolated fixtures impossible. In
production the only writer of roots is a markdown file, so the rule lives in a unit test over that
file. **Catching it at authoring time is cheaper and clearer than catching it at INSERT.** Method that
found it in one step: revert ONLY the suspect change and re-run → isolate before you redesign.

**After a mass delete, `VACUUM ANALYZE`.** Deleting ~1,400 rows left dead tuples and six tables that
had **never** been analysed — the planner would have started the next ingestion with statistics from a
database that no longer existed.

### 5. Contract-first API

- Every endpoint declares a `response_model` (Pydantic DTO) → drives the OpenAPI → the generated
  `@cuadra/api-client`. After ANY DTO/endpoint change: **`make openapi`** (dumps `openapi.json` +
  regenerates the client). Web/mobile typecheck then goes red on breaking changes — the contract is
  a compile-time test. `operation_id`s stable; versioned under `/v1`.

### 6. Testing — Strict TDD, RED-first (ADR 23)

- **RED → GREEN → REFACTOR.** Write the failing test first; implement to green; refactor.
- `tests/{unit,integration}/`. Markers are auto-applied by path (`*/unit/*` → `unit`,
  `*/integration/*` → `integration`) — no decorators needed. `pytest -m "not integration"` = fast loop.
- **`db_session` fixture** (conftest): transactional, rolls back after each test (no residue), and
  **SKIPS if the DB is down** — so unit tests never require Postgres. Integration tests DO (cuadra-db).
- Domain/use-case tests use **FAKE repos** implementing the port (no DB). Optional deps (e.g. dagster)
  use `pytest.importorskip("dagster")` so CI without them still passes.
- Money/matching/normalization logic is ALWAYS tested (a wrong number is the worst bug).
- **A guard test you have never SEEN fail is not a guard.** After writing one, break the thing it
  protects and confirm it goes red, then restore. Done for the `alembic check` guard by removing one
  index declaration. A test that can only pass proves nothing — and this repo has already shipped a
  guard that "passed for the wrong reason" (see `cuadra-save-vocabulary`).
- **Never assert on data a human curates.** `test_backfill_populated_do_basket_queries` pinned
  `len(rows) == 213` and two literal rows of `basket_query` — which an admin edits from the console.
  The day someone renamed one, the test went red with nothing broken, and stayed red. Assert the
  INVARIANT (populated, well-formed, labels within the known set), not the contents.
- **A test failing on your branch is not automatically yours.** Check before you claim it: a
  pre-existing red masked a real regression for a whole session here. Prove ownership by reverting
  only the suspect change.

## Do / Don't

| ✅ Do | ❌ Don't |
|---|---|
| `domain/` pure (dataclasses, Protocols) | `import sqlalchemy` in `domain/` |
| Cross-context by UUID + `application` service | FK or import across contexts (import-linter fails) |
| Money as `Money(int minor)` | float/double for money |
| Edit model → autogenerate → REVIEW → upgrade | Hand-write DDL / skip reviewing the migration |
| `op.alter_column(new_column_name=…)` for renames | Let autogenerate drop+add a rename (data loss) |
| `response_model` on every endpoint + `make openapi` | Change a DTO without regenerating the client |
| RED-first; fakes for unit, real DB for integration | Ship domain/money logic untested |
| Fix an import-linter violation at the boundary | `# noqa` / suppress the contract |
| Declare hand-made (expression/partial) indexes in `__table_args__` | Leave `alembic check` red — a check that always fails is off |
| Index the FKs that appear in queries | Index all 12 FKs "for safety" — writes pay for every one |
| Compute a derived column in a trigger | Trust the caller to keep `level`/depth in sync |
| Key curated data to a stable `key`/id | Key anything to a name a human can rename |
| Grep for the CALLER before believing seed data ships | Assume a data file is wired because it exists and is tested |
| Enforce an invariant at the source that writes it | Push a table constraint that fixtures legitimately need to break |
| Break a new guard test on purpose to see it go red | Trust a guard you have only ever seen green |

## Commands

```bash
cd apps/api
uv run pytest                          # full suite (skips integration if no DB)
uv run pytest -m "not integration"     # fast unit loop
uv run pytest tests/<ctx>              # one context
uv run ruff check src tests            # lint (line-length 100, py312)
uv run lint-imports                    # hexagonal boundaries (ADR 31/33)
uv run alembic upgrade head            # apply migrations (DB up)
uv run alembic revision --autogenerate -m "ctx: msg"
uv run alembic check                   # drift: models vs migrated DB. MUST be green (see §4b)
make openapi                           # (repo root) dump OpenAPI + regen api-client
```

## Resources

- **Architecture:** `docs/arquitectura-mvp.md` (§2 hexagonal, §6 Save, §7 aispace, §12·B money,
  ADR 31/33), `docs/estructura-monorepo.md` §2.
- **Domain skills:** `cuadra-save` (the Save context end-to-end) · `cuadra-agent-prompts` + `langgraph`
  (the aispace orchestrator).
- **Enforcement:** `.importlinter` (context boundaries) · `.github/workflows/ci.yml` (ruff · lint-imports · pytest).
```

## Paginar: el DTO de página SIEMPRE lleva `total` (2026-08-15)

`ProductCardPageDto { items, total }` (`contexts/save/application/dtos.py`). El total **no es un
adorno**: sin él el cliente no sabe cuándo dejar de pedir.

- Una página **llena** no significa que haya más.
- Una página **corta** no significa que se acabó — y esto no es teórico: `ListTodaysDeals` y
  `SearchProductCards` DESCARTAN en silencio los resultados cuyo producto ya no está en la oferta
  vigente. Ahí una página corta miente, y el cliente que se guiara por ella pararía antes de tiempo.

Contar en el SERVIDOR, que es quien tiene la lista entera, elimina las dos suposiciones. Y el total
se cuenta **sobre los que SOBREVIVEN al filtro**, no sobre los candidatos crudos: con los crudos el
cliente pediría páginas que no existen. Los dos casos tienen test dedicado.

Patrón de implementación: construir la lista COMPLETA, cortarla al final.

```python
cards = [_to_card(products[pid]) for pid in ranked_ids if pid in products]
return ProductCardPageDto(items=cards[offset : offset + limit], total=len(cards))
```

### Antes de reformar un endpoint: mirar QUIÉN lo consume

`/save/search` parecía el sitio natural para devolver tarjetas con precio. No lo era: lo comparten
la web y el typeahead del chat, y **el typeahead no quiere precios** — reformarlo habría encarecido
su consulta para beneficiar a otra pantalla. La respuesta fue un endpoint HERMANO
(`/save/search/cards`) compartiendo el ranking, no un cambio de forma del existente.

Un `grep` de consumidores antes de tocar la forma de una respuesta cuesta un minuto y decide el
diseño.
