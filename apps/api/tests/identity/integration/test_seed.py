"""Integration — el seed de identity es idempotente (correr 2 veces no duplica ni falla)."""
from __future__ import annotations

from sqlalchemy import func, select

from seeds.identity_seed import seed_identity
from src.contexts.identity.domain.enums import CapabilityKey
from src.contexts.identity.infrastructure.models import CapabilityModel, RoleModel


def test_seed_is_idempotent(db_session) -> None:  # type: ignore[no-untyped-def]
    seed_identity(db_session)
    seed_identity(db_session)  # 2ª vez: no debe duplicar ni romper
    db_session.flush()

    assert db_session.get(RoleModel, "normal_user") is not None
    assert db_session.get(RoleModel, "super_admin") is not None
    caps = db_session.scalar(select(func.count()).select_from(CapabilityModel))
    assert caps == len(CapabilityKey)
