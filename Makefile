.PHONY: help install api mobile db-up db-down migrate seed openapi api-client test

help:
	@echo "Cuadra — comandos del monorepo"
	@echo "  make install     Instala deps (pnpm + uv)"
	@echo "  make api         Levanta el backend (uvicorn, :8005)"
	@echo "  make mobile      Levanta el mobile (expo)"
	@echo "  make db-up       Postgres+pgvector (docker)"
	@echo "  make migrate     alembic upgrade head"
	@echo "  make seed        Carga el seed inicial"
	@echo "  make openapi     Vuelca openapi.json + regenera api-client"
	@echo "  make test        Tests del backend"

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

openapi:
	cd apps/api && uv run python -m src.openapi_dump > openapi.json
	pnpm --filter @cuadra/api-client generate

test:
	cd apps/api && uv run pytest
