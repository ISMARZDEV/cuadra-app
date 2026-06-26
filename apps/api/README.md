# Cuadra API (backend)

Python · FastAPI · LangGraph. **Context-first hexagonal** (ADR 1, §4). Ver `docs/estructura-monorepo.md`.

## Correr

```bash
uv sync
uv run uvicorn src.main:app --reload --port 8005   # → http://localhost:8005/v1/health
uv run pytest
```

## Capas (`src/`)

- `api/` — presentación (HTTP/WS), `composition_root` (DI). ADR 24.
- `contexts/{identity,insights,save,news,aispace}` — bounded contexts (`domain` puro · `application` · `infrastructure`).
- `ingestion/` — captura modular tras puertos (OCR/STT/enrichment). ADR 29.
- `platform/` — delivery plane (billing/notifications/outcomes/observability/jobs). §12·E.
- `shared/` — kernel (money/market/llm/db/...). 

## Reglas

- `domain/` sin ORM (ADR 31). Ningún contexto toca la DB de otro (ADR 33). Schema Postgres por contexto.
- Migraciones = **Alembic** (`alembic revision --autogenerate`); nunca DDL a mano.
