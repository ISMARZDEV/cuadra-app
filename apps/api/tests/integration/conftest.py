"""Fixtures de integración: sesión transaccional (rollback → sin datos residuales).

Si la DB no está levantada (`make db-up`), los tests de integración se SALTAN
(no fallan) — los unit tests siguen corriendo sin DB.
"""
from __future__ import annotations

from collections.abc import Iterator

import pytest


@pytest.fixture
def db_session() -> Iterator[object]:
    from sqlalchemy import create_engine
    from sqlalchemy.exc import OperationalError
    from sqlalchemy.orm import Session

    from src.config import settings

    engine = create_engine(settings.database_url)
    try:
        conn = engine.connect()
    except OperationalError:
        engine.dispose()
        pytest.skip("DB no disponible — levanta con `make db-up`")

    trans = conn.begin()
    session = Session(bind=conn, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        trans.rollback()   # nada queda persistido
        conn.close()
        engine.dispose()
