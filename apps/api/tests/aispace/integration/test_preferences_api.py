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


# ── Monedas — principal (derivada de identity.home_market) + hasta 3 extra ─────────────────
def _seed_user(db_session: Session, *, home_market: str = "DO") -> str:
    """Crea el user en `identity.user` (currency_options lee `home_market` de ahí)."""
    from src.contexts.identity.infrastructure.models import UserModel

    user = UserModel(
        email=None, name="Test", locale="es-DO",
        home_market_id=home_market, current_market_id=home_market,
    )
    db_session.add(user)
    db_session.flush()
    return str(user.id)


def test_get_currencies_returns_primary_from_home_market_and_no_extra(db_session: Session) -> None:
    uid = _seed_user(db_session, home_market="US")
    try:
        r = _client(db_session).get("/v1/aispace/preferences/currencies", headers=_bearer(uid))
        assert r.status_code == 200, r.text
        assert r.json() == {"primary": "USD", "extra": [], "all": ["USD"]}
    finally:
        app.dependency_overrides.clear()


def test_put_currencies_updates_extra_and_get_reflects(db_session: Session) -> None:
    uid = _seed_user(db_session, home_market="DO")
    try:
        client = _client(db_session)
        put = client.put(
            "/v1/aispace/preferences/currencies",
            json={"extra": ["USD", "EUR"]},
            headers=_bearer(uid),
        )
        assert put.status_code == 200, put.text
        assert put.json() == {"primary": "DOP", "extra": ["USD", "EUR"], "all": ["DOP", "USD", "EUR"]}

        got = client.get("/v1/aispace/preferences/currencies", headers=_bearer(uid))
        assert got.json()["extra"] == ["USD", "EUR"]
    finally:
        app.dependency_overrides.clear()


def test_put_currencies_more_than_three_extra_is_422(db_session: Session) -> None:
    uid = _seed_user(db_session)
    try:
        r = _client(db_session).put(
            "/v1/aispace/preferences/currencies",
            json={"extra": ["USD", "EUR", "COP", "BRL"]},
            headers=_bearer(uid),
        )
        assert r.status_code == 422, r.text
    finally:
        app.dependency_overrides.clear()


def test_put_currencies_inactive_currency_is_422(db_session: Session) -> None:
    uid = _seed_user(db_session)
    try:
        r = _client(db_session).put(
            "/v1/aispace/preferences/currencies",
            json={"extra": ["JPY"]},
            headers=_bearer(uid),
        )
        assert r.status_code == 422, r.text
    finally:
        app.dependency_overrides.clear()


def test_currencies_without_token_is_401() -> None:
    assert TestClient(app).get("/v1/aispace/preferences/currencies").status_code == 401
