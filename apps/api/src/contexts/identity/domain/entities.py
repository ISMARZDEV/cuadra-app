"""Entidades de dominio de identity — PURAS (sin SQLAlchemy · ADR 31).

`Capability`/`Role`/`AuthIdentity` son value-objects (igualdad por valor). `User`
es la entidad raíz. El gating por mercado NO vive aquí: lo aplica `CapabilityResolver`.
`email` es opcional: con OAuth (Apple Hide-My-Email) puede no venir.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .enums import AuthProvider, CapabilityKey, RoleKey
from .value_objects import Email, MarketId


@dataclass(frozen=True, slots=True)
class Capability:
    key: CapabilityKey


@dataclass(frozen=True, slots=True)
class Role:
    key: RoleKey
    capabilities: frozenset[CapabilityKey] = field(default_factory=frozenset)


@dataclass(frozen=True, slots=True)
class AuthIdentity:
    """Método de login del usuario. Clave estable = (provider, subject)."""

    user_id: str
    provider: AuthProvider
    subject: str
    email: str | None = None


@dataclass(frozen=True, slots=True)
class User:
    id: str
    name: str
    locale: str
    plan: str
    home_market: MarketId       # residencia / identidad fiscal (estable) · §3·B
    current_market: MarketId    # ubicación actual (contexto) · §3·B
    email: Email | None = None  # contacto (OAuth puede no darlo)
    roles: tuple[Role, ...] = ()
