"""Integration — repos de identity contra la DB real + CapabilityResolver end-to-end."""
from __future__ import annotations

from sqlalchemy.orm import Session

from src.contexts.identity.domain.enums import CapabilityKey
from src.contexts.identity.domain.services import CapabilityResolver
from src.contexts.identity.infrastructure.models import (
    CapabilityMarketModel,
    CapabilityModel,
    RoleCapabilityModel,
    RoleModel,
    UserModel,
    UserRoleModel,
)
from src.contexts.identity.infrastructure.repositories import (
    SqlCapabilityGatingRepository,
    SqlRoleRepository,
    SqlUserRepository,
)


def _seed_normal_user(session: Session) -> UserModel:
    session.add(RoleModel(key="normal_user", name="Usuario Normal"))
    session.add_all([CapabilityModel(key="wallet"), CapabilityModel(key="card")])
    session.flush()  # reference data PRIMERO (evita FK violations por orden de insert)
    session.add_all(
        [
            RoleCapabilityModel(role_key="normal_user", capability_key="wallet"),
            RoleCapabilityModel(role_key="normal_user", capability_key="card"),
        ]
    )
    # tarjeta deshabilitada en RD (gating por jurisdicción)
    session.add(CapabilityMarketModel(capability_key="card", market_id="DO", enabled=False))
    user = UserModel(
        email="ana@cuadra.do", name="Ana", home_market_id="DO", current_market_id="DO"
    )
    session.add(user)
    session.flush()  # asigna user.id (RETURNING) sin commitear
    session.add(UserRoleModel(user_id=user.id, role_key="normal_user"))
    session.flush()
    return user


def test_effective_capabilities_with_market_gating(db_session: Session) -> None:
    user = _seed_normal_user(db_session)

    roles = SqlRoleRepository(db_session).list_by_user(str(user.id))
    gating = SqlCapabilityGatingRepository(db_session).gating_for_market("DO")
    effective = CapabilityResolver.resolve(roles, gating)

    assert CapabilityKey.WALLET in effective
    assert CapabilityKey.CARD not in effective  # deshabilitada en RD


def test_user_repository_maps_to_entity(db_session: Session) -> None:
    user = _seed_normal_user(db_session)

    entity = SqlUserRepository(db_session).get_by_id(str(user.id))

    assert entity is not None
    assert entity.email is not None and str(entity.email) == "ana@cuadra.do"
    assert str(entity.home_market) == "DO"
    assert len(entity.roles) == 1
