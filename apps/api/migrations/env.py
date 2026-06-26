"""Alembic env (ADR 27/31). La URL viene de src.config (no se hardcodea).

`target_metadata` se llenará cuando existan models SQLAlchemy por contexto
(`src/contexts/*/infrastructure/models.py`) para habilitar `--autogenerate`.
"""
from __future__ import annotations

from alembic import context
from sqlalchemy import engine_from_config, pool

from src.config import settings

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

# TODO (Fase 1+): from src.shared.db import Base; target_metadata = Base.metadata
target_metadata = None


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
