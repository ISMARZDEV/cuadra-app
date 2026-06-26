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

    # Observabilidad (ADR 28)
    langsmith_api_key: str = ""
    sentry_dsn: str = ""


settings = Settings()
