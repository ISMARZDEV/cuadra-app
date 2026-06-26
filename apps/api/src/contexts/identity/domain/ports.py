"""Puertos del dominio identity (interfaces · DIP). `typing.Protocol` = interface
structural; la implementación SQLAlchemy vive en `infrastructure` (ADR 31).

Inyectados por el composition_root (DI). El dominio depende de estas abstracciones,
nunca de la infraestructura.
"""
from __future__ import annotations

from typing import Protocol

from .entities import Role, User
from .enums import CapabilityKey


class UserRepository(Protocol):
    def get_by_id(self, user_id: str) -> User | None: ...
    def get_by_email(self, email: str) -> User | None: ...


class RoleRepository(Protocol):
    def list_by_user(self, user_id: str) -> list[Role]: ...


class CapabilityGatingRepository(Protocol):
    """Gating de capabilities para un mercado (tabla capability_market)."""

    def gating_for_market(self, market_id: str) -> dict[CapabilityKey, bool]: ...
