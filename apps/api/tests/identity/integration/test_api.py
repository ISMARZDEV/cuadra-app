"""Integration — endpoint GET /v1/identity/me de punta a punta (HTTP + DB)."""
from __future__ import annotations

import jwt
from fastapi.testclient import TestClient

from src.api.composition_root import get_session
from src.config import settings
from src.main import app


def _bearer(user_id: str) -> dict[str, str]:
    token = jwt.encode({"sub": user_id}, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}


def test_get_me_returns_user_and_effective_capabilities(db_session, seeded_user) -> None:  # type: ignore[no-untyped-def]
    app.dependency_overrides[get_session] = lambda: db_session  # usa la sesión transaccional del test
    try:
        client = TestClient(app)
        res = client.get("/v1/identity/me", headers=_bearer(str(seeded_user.id)))
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 200
    body = res.json()
    assert body["current_market"] == "DO"
    assert "wallet" in body["capabilities"]
    assert "card" not in body["capabilities"]   # gating por mercado aplicado
    assert body["email"] == "ana@cuadra.do"


def test_get_me_without_token_is_401() -> None:
    client = TestClient(app)
    res = client.get("/v1/identity/me")
    assert res.status_code == 401
    assert res.json()["status"] == 401   # ProblemDetailDto


def test_get_me_with_garbage_token_is_401() -> None:
    client = TestClient(app)
    res = client.get("/v1/identity/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert res.status_code == 401
