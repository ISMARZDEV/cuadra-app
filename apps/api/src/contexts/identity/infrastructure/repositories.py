"""Implementaciones SQLAlchemy de los puertos de identity (infra · ADR 31).

La **`Session` ES el Unit of Work** (commit/rollback lo maneja quien la crea, p.ej.
el `Depends(get_session)`). Las consultas **filtran en la query** (SQL), no en memoria.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.contexts.identity.domain.entities import AuthIdentity, Role, User
from src.contexts.identity.domain.enums import CapabilityKey, RoleKey

from .mappers import auth_identity_to_entity, role_to_entity, user_to_entity
from .models import (
    AuthIdentityModel,
    CapabilityMarketModel,
    RoleCapabilityModel,
    UserModel,
    UserRoleModel,
)


class SqlRoleRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_by_user(self, user_id: str) -> list[Role]:
        stmt = (
            select(UserRoleModel.role_key, RoleCapabilityModel.capability_key)
            .outerjoin(
                RoleCapabilityModel,
                RoleCapabilityModel.role_key == UserRoleModel.role_key,
            )
            .where(UserRoleModel.user_id == uuid.UUID(user_id))
        )
        caps_by_role: dict[str, set[str]] = {}
        for role_key, cap_key in self._session.execute(stmt).all():
            bucket = caps_by_role.setdefault(role_key, set())
            if cap_key is not None:
                bucket.add(cap_key)
        return [role_to_entity(rk, caps) for rk, caps in caps_by_role.items()]


class SqlCapabilityGatingRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def gating_for_market(self, market_id: str) -> dict[CapabilityKey, bool]:
        stmt = select(
            CapabilityMarketModel.capability_key, CapabilityMarketModel.enabled
        ).where(CapabilityMarketModel.market_id == market_id)
        return {
            CapabilityKey(cap_key): enabled
            for cap_key, enabled in self._session.execute(stmt).all()
        }


class SqlUserRepository:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._roles = SqlRoleRepository(session)

    def get_by_id(self, user_id: str) -> User | None:
        model = self._session.get(UserModel, uuid.UUID(user_id))
        if model is None:
            return None
        return user_to_entity(model, self._roles.list_by_user(user_id))

    def get_by_email(self, email: str) -> User | None:
        model = self._session.scalars(
            select(UserModel).where(UserModel.email == email.strip().lower())
        ).first()
        if model is None:
            return None
        return user_to_entity(model, self._roles.list_by_user(str(model.id)))

    def create(
        self,
        *,
        email: str | None,
        name: str,
        home_market: str,
        current_market: str,
        role: RoleKey,
    ) -> str:
        model = UserModel(
            email=email.strip().lower() if email else None,
            name=name,
            home_market_id=home_market,
            current_market_id=current_market,
        )
        self._session.add(model)
        self._session.flush()  # asigna model.id (RETURNING) sin commitear
        self._session.add(UserRoleModel(user_id=model.id, role_key=role.value))
        return str(model.id)


class SqlAuthIdentityRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_by_provider_subject(self, provider: str, subject: str) -> AuthIdentity | None:
        model = self._session.scalars(
            select(AuthIdentityModel).where(
                AuthIdentityModel.provider == provider,
                AuthIdentityModel.subject == subject,
            )
        ).first()
        return auth_identity_to_entity(model) if model else None

    def link(
        self, *, user_id: str, provider: str, subject: str, email: str | None
    ) -> None:
        self._session.add(
            AuthIdentityModel(
                user_id=uuid.UUID(user_id), provider=provider, subject=subject, email=email
            )
        )
        self._session.flush()
