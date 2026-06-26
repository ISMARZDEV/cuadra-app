"""Entidades de dominio de identity — PURAS (sin SQLAlchemy · ADR 31).

`Capability` y `Role` son value-objects (igualdad por valor). `User` es la
entidad raíz (identidad por `id`). El gating por mercado NO vive aquí: lo aplica
`CapabilityResolver` con los datos de `capability_market` (separación de concerns).
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .enums import CapabilityKey, RoleKey
from .value_objects import Email, MarketId


@dataclass(frozen=True, slots=True)
class Capability:
    key: CapabilityKey


@dataclass(frozen=True, slots=True)
class Role:
    key: RoleKey
    capabilities: frozenset[CapabilityKey] = field(default_factory=frozenset)


@dataclass(frozen=True, slots=True)
class User:
    id: str
    email: Email
    name: str
    locale: str
    plan: str
    home_market: MarketId       # residencia / identidad fiscal (estable) · §3·B
    current_market: MarketId    # ubicación actual (contexto) · §3·B
    roles: tuple[Role, ...] = ()
