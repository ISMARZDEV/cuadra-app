"""Configuración de la app (pydantic-settings). Lee de entorno / .env."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Cuadra API"
    app_env: str = "dev"

    # DB — PostgreSQL único (ADR 31). Réplica de lectura opcional (§12·E E.5).
    database_url: str = "postgresql+psycopg://cuadra:cuadra@localhost:5432/cuadra"
    database_url_read: str = ""

    # IA
    anthropic_api_key: str = ""

    # Observabilidad (ADR 28)
    langsmith_api_key: str = ""
    sentry_dsn: str = ""


settings = Settings()
