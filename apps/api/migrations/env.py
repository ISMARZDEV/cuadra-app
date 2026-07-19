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

# Registra los models de cada contexto en Base.metadata (para --autogenerate).
from src.shared.db.base import Base  # noqa: E402
import src.contexts.identity.infrastructure.models  # noqa: F401,E402  (registra las tablas)
import src.contexts.insights.infrastructure.models  # noqa: F401,E402  (registra las tablas)
import src.contexts.aispace.infrastructure.models  # noqa: F401,E402  (registra las tablas)
import src.contexts.save.infrastructure.models  # noqa: F401,E402  (registra las tablas)

target_metadata = Base.metadata

# --- Filtro de autogenerate: qué objetos son NUESTROS -------------------------------------------
# `include_schemas=True` hace que Alembic escanee TODOS los schemas del DB. Todo lo que encuentra y
# no está en `Base.metadata` lo propone DROPEAR. Sin este filtro, cada `--autogenerate` de este repo
# genera —verificado tres veces— un `downgrade` disfrazado de `upgrade`:
#
#   op.drop_table('checkpoints') / ('checkpoint_blobs') / ('checkpoint_writes') / ('checkpoint_migrations')
#   op.drop_index('ix_canonical_product_embedding')  # HNSW/pgvector
#   op.drop_index('ix_canonical_product_name_trgm')  # GIN/pg_trgm
#
# Las primeras las crea LangGraph por su cuenta (checkpointer de Postgres = la memoria del agente).
# Los índices SON nuestros, pero se crean con SQL crudo por sus opclasses; el autogenerate no sabe
# reconciliarlos y los propone dropear aunque estén perfectos. Y perderlos NO rompe nada: la cascada
# de matching degrada a sequential scan y sigue "andando" — miente en verde.
#
# Confiar en que el humano lo note en cada revisión es una salvaguarda basada en disciplina. Esto la
# vuelve estructural.
_MANAGED_SCHEMAS = {t.schema for t in target_metadata.tables.values() if t.schema}

# Índices creados con SQL crudo (opclasses / USING que el autogenerate no reconcilia).
_UNMANAGED_INDEXES = {
    "ix_canonical_product_embedding",  # HNSW, vector_cosine_ops
    "ix_canonical_product_name_trgm",  # GIN, gin_trgm_ops
    "ix_store_product_freshness",
}


def include_object(obj, name, type_, reflected, compare_to):  # type: ignore[no-untyped-def]
    """Excluye del autogenerate lo que no administramos nosotros."""
    if type_ == "table":
        # Fuera de nuestros schemas = de otro dueño (LangGraph, spikes). Alembic gestiona su propia
        # `alembic_version` aparte, así que excluirla acá es inocuo.
        return obj.schema in _MANAGED_SCHEMAS
    if type_ == "index" and name in _UNMANAGED_INDEXES:
        return False
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
        include_object=include_object,
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
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=True,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
