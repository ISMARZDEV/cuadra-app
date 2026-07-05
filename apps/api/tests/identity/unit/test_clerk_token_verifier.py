"""Unit — ClerkTokenVerifier: verifica un session token de Clerk (RS256/JWKS) → VerifiedClaims.

Sin red: se genera un par RSA en el test, se firma el token y se inyecta un JWK client fake
que devuelve la clave pública. Cubre firma, issuer, azp (anti-CSRF), expiración y los claims
custom (email/name, que Clerk NO incluye por defecto). La receta (RS256 + validar exp/nbf/azp)
sale de la doc oficial de Clerk (manual JWT verification).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from src.contexts.identity.domain.enums import AuthProvider
from src.contexts.identity.infrastructure.auth import InvalidToken
from src.contexts.identity.infrastructure.clerk_token_verifier import ClerkTokenVerifier

_ISSUER = "https://cuadra.clerk.accounts.dev"
_AZP = "http://localhost:3006"

_PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_PUBLIC_KEY = _PRIVATE_KEY.public_key()


class _FakeJwkClient:
    """Sustituye a PyJWKClient: devuelve la clave pública conocida, sin ir a la red."""

    def get_signing_key_from_jwt(self, token: str):  # type: ignore[no-untyped-def]
        return SimpleNamespace(key=_PUBLIC_KEY)


def _token(**overrides) -> str:  # type: ignore[no-untyped-def]
    now = datetime.now(timezone.utc)
    claims = {
        "sub": "user_2clerk",
        "iss": _ISSUER,
        "azp": _AZP,
        "iat": now,
        "nbf": now,
        "exp": now + timedelta(hours=1),
        "email": "ada@example.com",
        "name": "Ada",
    }
    claims.update(overrides)
    return jwt.encode(claims, _PRIVATE_KEY, algorithm="RS256")


def _verifier() -> ClerkTokenVerifier:
    return ClerkTokenVerifier(
        issuer=_ISSUER, authorized_parties=(_AZP,), jwk_client=_FakeJwkClient()
    )


def test_valid_token_yields_claims() -> None:
    claims = _verifier().verify(_token())

    assert claims.provider is AuthProvider.CLERK
    assert claims.subject == "user_2clerk"
    assert claims.email == "ada@example.com"
    assert claims.name == "Ada"


def test_missing_email_and_name_are_none() -> None:
    claims = _verifier().verify(_token(email=None, name=None))

    assert claims.email is None
    assert claims.name is None


def test_rejects_wrong_issuer() -> None:
    with pytest.raises(InvalidToken):
        _verifier().verify(_token(iss="https://evil.example.com"))


def test_rejects_unauthorized_party() -> None:
    with pytest.raises(InvalidToken):
        _verifier().verify(_token(azp="https://evil.example.com"))


def test_rejects_expired_token() -> None:
    past = datetime.now(timezone.utc) - timedelta(hours=2)
    with pytest.raises(InvalidToken):
        _verifier().verify(_token(exp=past, iat=past, nbf=past))


def test_rejects_tampered_signature() -> None:
    tampered = _token() + "x"
    with pytest.raises(InvalidToken):
        _verifier().verify(tampered)


def test_rejects_token_signed_by_other_key() -> None:
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(timezone.utc)
    forged = jwt.encode(
        {"sub": "x", "iss": _ISSUER, "azp": _AZP, "iat": now, "exp": now + timedelta(hours=1)},
        other,
        algorithm="RS256",
    )
    with pytest.raises(InvalidToken):
        _verifier().verify(forged)
