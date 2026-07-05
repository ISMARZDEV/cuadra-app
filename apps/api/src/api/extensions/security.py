"""Dependencias de seguridad/autorización (HTTP boundary).

- `get_current_user_id`: valida el JWT Bearer → `user_id` (401 si falta/inválido). Enruta por el
  `alg` del token: RS256 = IdP real (Clerk, JWKS → aprovisiona/mapea el usuario); HS256 = dev-login,
  aceptado SOLO en dev (secreto compartido — en prod el token lo firma el IdP, nunca nosotros).
- `require_capability(cap)`: gate reutilizable por cualquier endpoint — 403 si el usuario
  no tiene la capability EFECTIVA (mismo patrón que el `require_permission` del reuso).
"""
from __future__ import annotations

from collections.abc import Callable

import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from src.api.composition_root import get_clerk_verifier, get_session
from src.config import settings
from src.contexts.identity.application.authentication import ResolveUserFromClaims
from src.contexts.identity.domain.enums import CapabilityKey
from src.contexts.identity.domain.ports import TokenVerifier
from src.contexts.identity.domain.services import CapabilityResolver
from src.contexts.identity.infrastructure.auth import InvalidToken, decode_token
from src.contexts.identity.infrastructure.repositories import (
    SqlAuthIdentityRepository,
    SqlCapabilityGatingRepository,
    SqlUserRepository,
)

_UNAUTHORIZED = HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido")


def get_current_user_id(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
    verifier: TokenVerifier = Depends(get_clerk_verifier),
) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Falta el token Bearer")
    token = authorization.split(" ", 1)[1]
    try:
        alg = jwt.get_unverified_header(token).get("alg")
    except jwt.PyJWTError:
        raise _UNAUTHORIZED from None

    if alg == "RS256":  # IdP real (Clerk): verifica firma (JWKS) → aprovisiona/mapea
        try:
            claims = verifier.verify(token)
        except InvalidToken:
            raise _UNAUTHORIZED from None
        return ResolveUserFromClaims(
            SqlUserRepository(session), SqlAuthIdentityRepository(session)
        ).execute(claims)

    if alg == "HS256" and settings.app_env == "dev":  # dev-login: `sub` = nuestro user_id
        try:
            user_id = decode_token(token).get("sub")
        except InvalidToken:
            raise _UNAUTHORIZED from None
        if not user_id:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token sin 'sub'")
        return user_id

    raise _UNAUTHORIZED  # HS256 fuera de dev, o algoritmo no soportado


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
