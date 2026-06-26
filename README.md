# 🟢 Cuadra — Monorepo

Copiloto financiero con IA para LatAm (RD primero). Backend **Python/FastAPI + LangGraph**, mobile
**React Native/Expo**. Estructura **hexagonal + screaming**, monolito modular microservices-ready.

> **Estado:** esqueleto (scaffolding) — estructura y archivos base, sin lógica de negocio aún.
> **Arquitectura:** ver [`docs/`](./docs) (`arquitectura-mvp.md`, `estructura-monorepo.md`).

## Estructura

```
apps/
  api/        # Python · FastAPI · LangGraph (context-first hexagonal)
  mobile/     # React Native · Expo Router
packages/
  api-client/ # cliente TS generado desde OpenAPI (@hey-api/openapi-ts)
  shared-types/ · config/
infra/        # docker · ci · env
docs/         # documentación arquitectónica
```

## Cómo correr

```bash
make install      # deps (pnpm + uv)
make db-up        # Postgres + pgvector (docker)
make migrate      # schema (Alembic)
make api          # backend  → http://localhost:8005/v1/health
make mobile       # app Expo
```

## Convenciones

- **Código en inglés, prosa/docs en español** (ADR 32).
- **`domain/` puro** (sin ORM); ORM solo en `infrastructure/` (ADR 31).
- **Ningún contexto toca la DB de otro** — solo por su `application` service (ADR 33).
- **Migraciones = Alembic** (nunca DDL a mano); ver `docs/estructura-monorepo.md`.
