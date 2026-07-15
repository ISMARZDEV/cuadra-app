"""Integration — enrutado de autenticación en get_current_user_id (HTTP + DB).

get_current_user_id enruta por el `alg` del token:
- RS256 → verificador Clerk (JWKS) → ResolveUserFromClaims (aprovisiona/mapea) → user_id.
- HS256 → dev-login, SOLO en dev (secreto compartido; en prod se rechaza — anti-bypass).

El verificador Clerk se inyecta por dependency_override (fake) para no ir a la red; el token
sólo necesita el header alg=RS256 para que el enrutado lo tome por la vía Clerk.
"""
from __future__ import annotations

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from src.api.composition_root import get_clerk_verifier, get_session
from src.config import settings
from src.contexts.identity.domain.enums import AuthProvider
from src.contexts.identity.domain.value_objects import VerifiedClaims
from src.main import app

_RSA = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _rs256_token(sub: str) -> str:
    return jwt.encode({"sub": sub, "iss": "https://cuadra.clerk.accounts.dev"}, _RSA, algorithm="RS256")


class _FakeVerifier:
    def __init__(self, claims: VerifiedClaims) -> None:
        self._claims = claims

    def verify(self, token: str) -> VerifiedClaims:
        return self._claims


def test_clerk_rs256_token_provisions_and_authenticates(db_session) -> None:  # type: ignore[no-untyped-def]
    from seeds.identity_seed import seed_identity

    seed_identity(db_session)  # roles para el user_role del alta JIT
    claims = VerifiedClaims(
        provider=AuthProvider.CLERK, subject="user_2clerk", email="nuevo@clerk.do", name="Nuevo"
    )
    app.dependency_overrides[get_session] = lambda: db_session
    app.dependency_overrides[get_clerk_verifier] = lambda: _FakeVerifier(claims)
    try:
        res = TestClient(app).get(
            "/v1/identity/me",
            headers={"Authorization": f"Bearer {_rs256_token('user_2clerk')}"},
        )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["email"] == "nuevo@clerk.do"
    assert body["current_market"] == "DO"
    assert "wallet" in body["capabilities"]  # rol normal_user aplicado


def test_hs256_token_rejected_outside_dev(db_session, seeded_user, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(settings, "app_env", "production")
    app.dependency_overrides[get_session] = lambda: db_session
    token = jwt.encode(
        {"sub": str(seeded_user.id)}, settings.jwt_secret, algorithm="HS256"
    )
    try:
        res = TestClient(app).get(
            "/v1/identity/me", headers={"Authorization": f"Bearer {token}"}
        )
    finally:
        app.dependency_overrides.clear()

    # El token HS256 (secreto compartido, dev-login) NUNCA se acepta en prod: lo firma el IdP.
    assert res.status_code == 401
