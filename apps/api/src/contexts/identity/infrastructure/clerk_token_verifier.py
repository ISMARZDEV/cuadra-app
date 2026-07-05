"""Adapter que verifica un session token de Clerk (RS256 vía JWKS) → VerifiedClaims.

Implementa el puerto `TokenVerifier`. Receta (doc oficial de Clerk, manual JWT verification):
verificar la firma RS256 con la clave pública del JWKS, validar `iss` (issuer), `exp`/`nbf`
(PyJWT lo hace), y `azp` contra los authorized parties (anti-CSRF). El `sub` es el id de
usuario de Clerk (nuestra clave de login = (clerk, sub)). `email`/`name` NO vienen por
defecto: se inyectan como custom session claim en el dashboard de Clerk.

El `jwk_client` (PyJWKClient, que cachea el JWKS) se inyecta para poder testear sin red.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol

import jwt

from src.contexts.identity.domain.enums import AuthProvider
from src.contexts.identity.domain.value_objects import VerifiedClaims

from .auth import InvalidToken


class _JwkClient(Protocol):
    def get_signing_key_from_jwt(self, token: str): ...  # type: ignore[no-untyped-def]


class ClerkTokenVerifier:
    def __init__(
        self,
        *,
        issuer: str,
        authorized_parties: Sequence[str],
        jwk_client: _JwkClient,
    ) -> None:
        self._issuer = issuer
        self._authorized_parties = tuple(authorized_parties)
        self._jwk_client = jwk_client

    def verify(self, token: str) -> VerifiedClaims:
        try:
            signing_key = self._jwk_client.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                issuer=self._issuer,
                options={"require": ["exp", "iat", "sub"]},
            )
        except jwt.PyJWTError as exc:  # firma inválida, expirado, issuer, falta claim
            raise InvalidToken(str(exc)) from exc
        except Exception as exc:  # p.ej. el JWKS no resuelve la clave
            raise InvalidToken(f"No se pudo resolver la clave: {exc}") from exc

        azp = claims.get("azp")
        if self._authorized_parties and azp not in self._authorized_parties:
            raise InvalidToken(f"azp no autorizado: {azp!r}")

        subject = claims.get("sub")
        if not subject:
            raise InvalidToken("Token sin 'sub'")

        return VerifiedClaims(
            provider=AuthProvider.CLERK,
            subject=subject,
            email=claims.get("email"),
            name=claims.get("name"),
        )


class NullTokenVerifier:
    """Verificador inactivo — cuando Clerk NO está configurado (dev sin IdP). Rechaza todo token
    RS256: sin el issuer/JWKS del IdP no hay forma de validar su firma."""

    def verify(self, token: str) -> VerifiedClaims:
        raise InvalidToken("IdP (Clerk) no configurado")
