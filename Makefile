.PHONY: help install api mobile db-up db-down migrate seed save-refresh save-backfill-brands save-repair-sizes openapi api-client test test-unit test-ctx eval eval-retrieval eval-perf

help:
	@echo "Cuadra — comandos del monorepo"
	@echo "  make install     Instala deps (pnpm + uv)"
	@echo "  make api         Levanta el backend (uvicorn, :8005)"
	@echo "  make mobile      Levanta el mobile (expo)"
	@echo "  make db-up       Postgres+pgvector (docker)"
	@echo "  make migrate     alembic upgrade head"
	@echo "  make seed        Carga el seed inicial"
	@echo "  make save-refresh  Refresca precios vivos de Save (Sirena/Nacional/Jumbo)"
	@echo "  make save-backfill-brands  Rellena marcas de productos ya ingeridos (idempotente)"
	@echo "  make save-repair-sizes     Repara tamanos guardados desde una fraccion (idempotente)"
	@echo "  make ingestion-dev Levanta Dagster (orquestador de ingesta, UI local)"
	@echo "  make openapi     Vuelca openapi.json + regenera api-client"
	@echo "  make test        Suite completa del backend (gate)"
	@echo "  make test-unit   Solo unit, sin DB (loop TDD rápido)"
	@echo "  make test-ctx CTX=identity   Tests de un contexto"
	@echo "  make eval        Mini-eval del FinanceAgent (LLM real, no es gate)"
	@echo "  make eval-retrieval  Mini-eval de la búsqueda híbrida: top-1/top-5 (no es gate)"
	@echo "  make eval-perf   Mini-eval de rendimiento del chat: TTFT/latencia (no es gate)"

install:
	pnpm install
	cd apps/api && uv sync

api:
	cd apps/api && uv run uvicorn src.main:app --reload --port 8005

mobile:
	pnpm --filter @cuadra/mobile start

db-up:
	docker compose -f infra/docker/docker-compose.yml up -d

db-down:
	docker compose -f infra/docker/docker-compose.yml down

migrate:
	cd apps/api && uv run alembic upgrade head

seed:
	cd apps/api && uv run python -m seeds

save-refresh:
	cd apps/api && uv run python -m seeds.save_refresh

save-backfill-brands:
	cd apps/api && uv run python -m seeds.backfill_brands

save-repair-sizes:
	cd apps/api && uv run python -m seeds.repair_fraction_sizes

ingestion-dev:
	cd apps/api && uv run --group ingestion dagster dev -m ingestion.definitions

openapi:
	cd apps/api && uv run python -m src.openapi_dump > openapi.json
	pnpm --filter @cuadra/api-client generate

test:
	cd apps/api && uv run pytest

test-unit:
	cd apps/api && uv run pytest -m "not integration"

test-ctx:
	cd apps/api && uv run pytest tests/$(CTX)

eval:
	cd apps/api && uv run python -m evals.finance_eval

eval-retrieval:
	cd apps/api && uv run python -m evals.retrieval_eval

eval-perf:
	cd apps/api && uv run python -m evals.agent_perf --intent $(or $(INTENT),finance) --n $(or $(N),3)
