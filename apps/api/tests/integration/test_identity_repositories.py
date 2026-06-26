"""Integration — repos de identity contra la DB real + CapabilityResolver end-to-end."""
from __future__ import annotations

from sqlalchemy.orm import Session

from src.contexts.identity.domain.enums import CapabilityKey
from src.contexts.identity.domain.services import CapabilityResolver
from src.contexts.identity.infrastructure.repositories import (
    SqlCapabilityGatingRepository,
    SqlRoleRepository,
    SqlUserRepository,
)


def test_effective_capabilities_with_market_gating(db_session: Session, seeded_user) -> None:  # type: ignore[no-untyped-def]
    roles = SqlRoleRepository(db_session).list_by_user(str(seeded_user.id))
    gating = SqlCapabilityGatingRepository(db_session).gating_for_market("DO")
    effective = CapabilityResolver.resolve(roles, gating)

    assert CapabilityKey.WALLET in effective
    assert CapabilityKey.CARD not in effective  # deshabilitada en RD


def test_user_repository_maps_to_entity(db_session: Session, seeded_user) -> None:  # type: ignore[no-untyped-def]
    entity = SqlUserRepository(db_session).get_by_id(str(seeded_user.id))

    assert entity is not None
    assert entity.email is not None and str(entity.email) == "ana@cuadra.do"
    assert str(entity.home_market) == "DO"
    assert len(entity.roles) == 1
