"""Integration — endpoints /v1/aispace/preferences (GET/PUT) de punta a punta (HTTP + DB).

La sesión transaccional del test se inyecta por override de `get_session`. Verifica: default
COACH sin fila, PUT actualiza y GET lo refleja, valor inválido → 422, sin token → 401.
"""
from __future__ import annotations

import uuid
from collections.abc import Iterator

import jwt
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.api.composition_root import get_session
from src.config import settings
from src.main import app


def _bearer(user_id: str) -> dict[str, str]:
    token = jwt.encode({"sub": user_id}, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}


def _client(db_session: Session) -> TestClient:
    def _override() -> Iterator[Session]:
        yield db_session
    app.dependency_overrides[get_session] = _override
    return TestClient(app)


def test_get_returns_default_coach(db_session: Session) -> None:
    try:
        r = _client(db_session).get("/v1/aispace/preferences", headers=_bearer(str(uuid.uuid4())))
        assert r.status_code == 200, r.text
        assert r.json()["personality"] == "coach"
    finally:
        app.dependency_overrides.clear()


def test_put_updates_and_get_reflects(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    try:
        client = _client(db_session)
        put = client.put(
            "/v1/aispace/preferences", json={"personality": "roast"}, headers=_bearer(user_id)
        )
        assert put.status_code == 200, put.text
        assert put.json()["personality"] == "roast"

        got = client.get("/v1/aispace/preferences", headers=_bearer(user_id))
        assert got.json()["personality"] == "roast"
    finally:
        app.dependency_overrides.clear()


def test_put_invalid_personality_is_422(db_session: Session) -> None:
    try:
        r = _client(db_session).put(
            "/v1/aispace/preferences", json={"personality": "banana"}, headers=_bearer(str(uuid.uuid4()))
        )
        assert r.status_code == 422, r.text
    finally:
        app.dependency_overrides.clear()


def test_preferences_without_token_is_401() -> None:
    assert TestClient(app).get("/v1/aispace/preferences").status_code == 401
