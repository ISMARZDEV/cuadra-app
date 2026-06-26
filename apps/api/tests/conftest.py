"""Configuración y fixtures compartidas de pytest.

- `db_session`: sesión transaccional (rollback → sin datos residuales). Se SALTA si no hay DB.
- Auto-marcado por path: `*/integration/*` → marker `integration`; `*/unit/*` → `unit`.
  Así no hace falta decorar cada test, y `pytest -m "not integration"` corre solo lo rápido.
"""
from __future__ import annotations

from collections.abc import Iterator

import pytest


def pytest_collection_modifyitems(config, items) -> None:  # type: ignore[no-untyped-def]
    for item in items:
        path = str(item.fspath)
        if "/integration/" in path:
            item.add_marker(pytest.mark.integration)
        elif "/unit/" in path:
            item.add_marker(pytest.mark.unit)


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
        trans.rollback()
        conn.close()
        engine.dispose()
