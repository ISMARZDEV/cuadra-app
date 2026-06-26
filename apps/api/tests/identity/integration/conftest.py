"""Fixtures de integración del contexto identity."""
from __future__ import annotations

import pytest


@pytest.fixture
def seeded_user(db_session):  # type: ignore[no-untyped-def]
    """Usuario MVP con rol normal_user — reusa el seed real (DRY + idempotente).

    El seed deja `card`/`remittance` deshabilitadas en RD (gating de mercado).
    """
    from seeds.identity_seed import seed_identity
    from src.contexts.identity.infrastructure.models import UserModel, UserRoleModel

    seed_identity(db_session)
    user = UserModel(
        email="ana@cuadra.do", name="Ana", home_market_id="DO", current_market_id="DO"
    )
    db_session.add(user)
    db_session.flush()  # asigna user.id (RETURNING) sin commitear
    db_session.add(UserRoleModel(user_id=user.id, role_key="normal_user"))
    db_session.flush()
    return user
