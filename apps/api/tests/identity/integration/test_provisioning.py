"""Integration — escritura de aprovisionamiento JIT contra la DB real.

`SqlUserRepository.create` (user + rol) y `SqlAuthIdentityRepository.link` (identidad de
login) son las escrituras que respaldan `ResolveUserFromClaims`. El seed deja los roles
(FK de user_role). La sesión hace rollback al final del test (fixture transaccional).
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from src.contexts.identity.domain.enums import AuthProvider, RoleKey
from src.contexts.identity.infrastructure.repositories import (
    SqlAuthIdentityRepository,
    SqlUserRepository,
)


def _seed_roles(db_session: Session) -> None:
    from seeds.identity_seed import seed_identity

    seed_identity(db_session)


def test_create_provisions_user_with_role(db_session: Session) -> None:
    _seed_roles(db_session)
    repo = SqlUserRepository(db_session)

    user_id = repo.create(
        email="nueva@cuadra.do",
        name="Nueva",
        home_market="DO",
        current_market="DO",
        role=RoleKey.NORMAL_USER,
    )
    db_session.flush()

    entity = repo.get_by_id(user_id)
    assert entity is not None
    assert entity.email is not None and str(entity.email) == "nueva@cuadra.do"
    assert entity.name == "Nueva"
    assert str(entity.home_market) == "DO"
    assert str(entity.current_market) == "DO"
    assert [r.key for r in entity.roles] == [RoleKey.NORMAL_USER]


def test_create_allows_null_email_apple_hide_my_email(db_session: Session) -> None:
    _seed_roles(db_session)
    repo = SqlUserRepository(db_session)

    user_id = repo.create(
        email=None,
        name="Anon",
        home_market="DO",
        current_market="DO",
        role=RoleKey.NORMAL_USER,
    )
    db_session.flush()

    entity = repo.get_by_id(user_id)
    assert entity is not None
    assert entity.email is None


def test_link_maps_provider_subject_to_user(db_session: Session) -> None:
    _seed_roles(db_session)
    user_id = SqlUserRepository(db_session).create(
        email="link@cuadra.do",
        name="Link",
        home_market="DO",
        current_market="DO",
        role=RoleKey.NORMAL_USER,
    )
    db_session.flush()

    identities = SqlAuthIdentityRepository(db_session)
    identities.link(
        user_id=user_id, provider="clerk", subject="user_2clerk", email="link@cuadra.do"
    )
    db_session.flush()

    found = identities.get_by_provider_subject("clerk", "user_2clerk")
    assert found is not None
    assert found.user_id == user_id
    assert found.provider == AuthProvider.CLERK
    assert found.subject == "user_2clerk"
