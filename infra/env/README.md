# Entornos (ADR 27)

Plantillas de variables por entorno. **Los secretos NUNCA se commitean** — viven en un gestor
(GitHub Secrets / Doppler / 1Password). Aquí solo van plantillas `*.example`.

Entornos aislados: **dev · staging · prod** (DB y secrets por entorno).

Variables clave (ver `.env.example` en la raíz):
- `DATABASE_URL=postgresql+psycopg://cuadra:cuadra@localhost:5433/cuadra` (+ `DATABASE_URL_READ` para réplica · §12·E E.5)
  - *Nota: host 5433 — el 5432 lo ocupa otro Postgres local.*
- `ANTHROPIC_API_KEY`, `LANGSMITH_API_KEY`, `SENTRY_DSN`
- `EXPO_PUBLIC_API_URL=http://localhost:8005` (mobile → backend)
