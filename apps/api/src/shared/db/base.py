"""Kernel de persistencia: engine, session y Base declarativa (ADR 31, §12·E E.5).

El ORM vive SOLO en `infrastructure/` de cada contexto; el dominio nunca importa de aquí.
Cada contexto usará su propio schema Postgres + rol (ADR 33).
"""
from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from src.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Base declarativa compartida. `Base.metadata` alimenta el autogenerate de Alembic."""
