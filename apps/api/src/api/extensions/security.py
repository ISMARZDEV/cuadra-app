"""Dependencias de seguridad/autorización (HTTP boundary).

- `get_current_user_id`: valida el JWT Bearer → `user_id` (401 si falta/inválido).
- `require_capability(cap)`: gate reutilizable por cualquier endpoint — 403 si el usuario
  no tiene la capability EFECTIVA (mismo patrón que el `require_permission` del reuso).
"""
from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from src.api.composition_root import get_session
from src.contexts.identity.domain.enums import CapabilityKey
from src.contexts.identity.domain.services import CapabilityResolver
from src.contexts.identity.infrastructure.auth import InvalidToken, decode_token
from src.contexts.identity.infrastructure.repositories import (
    SqlCapabilityGatingRepository,
    SqlUserRepository,
)


def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Falta el token Bearer")
    try:
        claims = decode_token(authorization.split(" ", 1)[1])
    except InvalidToken:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido") from None
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token sin 'sub'")
    return user_id


def require_capability(capability: CapabilityKey) -> Callable[..., None]:
    """Dependency factory: exige `capability` efectiva (rol × current_market). 403 si falta."""

    def _dependency(
        user_id: str = Depends(get_current_user_id),
        session: Session = Depends(get_session),
    ) -> None:
        user = SqlUserRepository(session).get_by_id(user_id)
        if user is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario no encontrado")
        gating = SqlCapabilityGatingRepository(session).gating_for_market(str(user.current_market))
        if capability not in CapabilityResolver.resolve(user.roles, gating):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, f"Falta la capability: {capability.value}"
            )

    return _dependency
