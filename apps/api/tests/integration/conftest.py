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


@pytest.fixture
def seeded_user(db_session):  # type: ignore[no-untyped-def]
    """Usuario MVP: rol normal_user (wallet, card) con `card` deshabilitada en RD."""
    from src.contexts.identity.infrastructure.models import (
        CapabilityMarketModel,
        CapabilityModel,
        RoleCapabilityModel,
        RoleModel,
        UserModel,
        UserRoleModel,
    )

    db_session.add(RoleModel(key="normal_user", name="Usuario Normal"))
    db_session.add_all([CapabilityModel(key="wallet"), CapabilityModel(key="card")])
    db_session.flush()  # reference data PRIMERO (evita FK violations por orden de insert)
    db_session.add_all(
        [
            RoleCapabilityModel(role_key="normal_user", capability_key="wallet"),
            RoleCapabilityModel(role_key="normal_user", capability_key="card"),
        ]
    )
    db_session.add(CapabilityMarketModel(capability_key="card", market_id="DO", enabled=False))
    user = UserModel(
        email="ana@cuadra.do", name="Ana", home_market_id="DO", current_market_id="DO"
    )
    db_session.add(user)
    db_session.flush()  # asigna user.id (RETURNING) sin commitear
    db_session.add(UserRoleModel(user_id=user.id, role_key="normal_user"))
    db_session.flush()
    return user
