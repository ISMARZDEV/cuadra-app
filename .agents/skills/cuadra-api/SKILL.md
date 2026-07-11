---
name: cuadra-api
description: >
  Conventions + stack for Cuadra's backend (apps/api): FastAPI + SQLAlchemy + Alembic + Postgres/
  pgvector + LangGraph, structured as hexagonal bounded contexts (Clean/DDD, screaming). Covers
  the layer rules (domain PURE / application / infrastructure), ports as Protocols, composition-root
  DI, money in minor units, multi-country via shared/market, schema-per-context isolation (ADR 33,
  enforced by import-linter), the Alembic workflow, contract-first api-client, and Strict TDD.
  Trigger: Writing or editing anything under apps/api — entities, use-cases, repos, endpoints,
  migrations, ports/DTOs, the shared kernel, or backend tests.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.1"
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
make openapi                           # (repo root) dump OpenAPI + regen api-client
```

## Resources

- **Architecture:** `docs/arquitectura-mvp.md` (§2 hexagonal, §6 Save, §7 aispace, §12·B money,
  ADR 31/33), `docs/estructura-monorepo.md` §2.
- **Domain skills:** `cuadra-save` (the Save context end-to-end) · `cuadra-agent-prompts` + `langgraph`
  (the aispace orchestrator).
- **Enforcement:** `.importlinter` (context boundaries) · `.github/workflows/ci.yml` (ruff · lint-imports · pytest).
```
