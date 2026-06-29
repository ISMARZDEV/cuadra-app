"""Integration — POST /v1/identity/dev-login (solo en dev): emite un JWT usable.

Desbloquea el cliente móvil sin IdP externo. get-or-create del usuario por email + token.
En producción (app_env != dev) responde 404. Producción real = IdP externo (§E.2).
"""
from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.api.composition_root import get_session
from src.config import settings
from src.contexts.identity.infrastructure.auth import decode_token
from src.main import app


def test_dev_login_issues_usable_token(db_session: Session) -> None:
    app.dependency_overrides[get_session] = lambda: db_session
    try:
        client = TestClient(app)
        res = client.post("/v1/identity/dev-login", json={"email": "dev@cuadra.do"})
        assert res.status_code == 200, res.text
        body = res.json()
        claims = decode_token(body["access_token"])
        assert claims["sub"] == body["user_id"]          # el token lleva el user_id
        assert body["token_type"] == "bearer"

        # mismo email → MISMO usuario (get-or-create, no duplica)
        res2 = client.post("/v1/identity/dev-login", json={"email": "dev@cuadra.do"})
        assert res2.json()["user_id"] == body["user_id"]
    finally:
        app.dependency_overrides.clear()


def test_dev_login_disabled_outside_dev(db_session: Session, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(settings, "app_env", "production")
    app.dependency_overrides[get_session] = lambda: db_session
    try:
        res = TestClient(app).post("/v1/identity/dev-login", json={"email": "x@y.do"})
        assert res.status_code == 404   # en prod no existe; el token lo emite el IdP externo
    finally:
        app.dependency_overrides.clear()
