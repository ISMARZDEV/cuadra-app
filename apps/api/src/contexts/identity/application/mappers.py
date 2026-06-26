"""Mapeo entity → DTO (explícito). El dominio no conoce el DTO; se traduce aquí."""
from __future__ import annotations

from collections.abc import Iterable

from src.contexts.identity.domain.entities import User
from src.contexts.identity.domain.enums import CapabilityKey

from .dtos import MeResponse


def me_response(user: User, capabilities: Iterable[CapabilityKey]) -> MeResponse:
    return MeResponse(
        id=user.id,
        email=str(user.email) if user.email else None,
        name=user.name,
        locale=user.locale,
        plan=user.plan,
        home_market=str(user.home_market),
        current_market=str(user.current_market),
        capabilities=sorted(c.value for c in capabilities),
    )
