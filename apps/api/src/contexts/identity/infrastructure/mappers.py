"""Mappers model ↔ entity — EXPLÍCITOS (idiom hexagonal, no AutoMapper).

El dominio no conoce el ORM; aquí se traduce en un solo lugar.
"""
from __future__ import annotations

from collections.abc import Iterable

from src.contexts.identity.domain.entities import AuthIdentity, Role, User
from src.contexts.identity.domain.enums import AuthProvider, CapabilityKey, RoleKey
from src.contexts.identity.domain.value_objects import Email, MarketId

from .models import AuthIdentityModel, UserModel


def role_to_entity(role_key: str, capability_keys: Iterable[str]) -> Role:
    return Role(
        key=RoleKey(role_key),
        capabilities=frozenset(CapabilityKey(k) for k in capability_keys),
    )


def user_to_entity(model: UserModel, roles: Iterable[Role]) -> User:
    return User(
        id=str(model.id),
        name=model.name,
        locale=model.locale,
        plan=model.plan,
        home_market=MarketId(model.home_market_id),
        current_market=MarketId(model.current_market_id),
        email=Email(model.email) if model.email else None,
        roles=tuple(roles),
    )


def auth_identity_to_entity(model: AuthIdentityModel) -> AuthIdentity:
    return AuthIdentity(
        user_id=str(model.user_id),
        provider=AuthProvider(model.provider),
        subject=model.subject,
        email=model.email,
    )
