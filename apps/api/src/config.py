"""Configuración de la app (pydantic-settings). Lee de entorno / .env."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Cuadra API"
    app_env: str = "dev"

    # DB — PostgreSQL único (ADR 31). Réplica de lectura opcional (§12·E E.5).
    database_url: str = "postgresql+psycopg://cuadra:cuadra@localhost:5433/cuadra"
    database_url_read: str = ""

    # LLM — proveedor intercambiable tras LLMPort (§7.8, shared/llm).
    # Claude = default de prod (ADRs); OpenAI u otro vía LLM_PROVIDER (p.ej. dev).
    llm_provider: str = "anthropic"   # "anthropic" | "openai"
    anthropic_api_key: str = ""
    openai_api_key: str = ""

    # Observabilidad (ADR 28). LangSmith se auto-instrumenta por entorno: `langsmith_tracing`
    # activa el trazado y la key se exporta a os.environ en el arranque (ver src/observability.py).
    langsmith_api_key: str = ""
    langsmith_tracing: bool = False
    langsmith_project: str = "cuadra-api"
    sentry_dsn: str = ""

    # Auth (§12·E E.2) — el JWT lo emite/valida el proveedor; aquí solo la verificación de firma
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"

    # CORS (§12·E E.1) — coma-separado (evita el parseo JSON de listas de pydantic-settings)
    cors_origins: str = "*"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
