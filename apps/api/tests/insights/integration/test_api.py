"""Integration — endpoints `/v1/insights/*` de punta a punta (HTTP + DB).

Cubre el write path (POST /transactions: éxito, idempotencia §12·C, y mapeo de errores
de aplicación → ProblemDetails) y el read path (GET /metrics deriva del ledger las
tarjetas de §5.3). La sesión transaccional del test se inyecta vía dependency_override.
"""
from __future__ import annotations

import uuid

import jwt
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.api.composition_root import get_session
from src.config import settings
from src.contexts.insights.domain.ledger import Account, AccountType
from src.contexts.insights.infrastructure.repositories import SqlAccountRepository
from src.main import app
from src.shared.money import Currency

DOP = Currency("DOP")


def _bearer(user_id: str) -> dict[str, str]:
    token = jwt.encode({"sub": user_id}, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}


def _seed_accounts(session: Session, user_id: str) -> tuple[Account, Account]:
    accounts = SqlAccountRepository(session)
    banco = Account(str(uuid.uuid4()), user_id, AccountType.ASSET, DOP, "Banco")
    fuel = Account(str(uuid.uuid4()), user_id, AccountType.EXPENSE, DOP, "Combustible")
    accounts.add(banco)
    accounts.add(fuel)
    return banco, fuel


def _payload(banco: Account, fuel: Account, **overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "type": "expense",
        "amount_minor": 50_000,
        "currency": "DOP",
        "account_id": banco.id,
        "counter_account_id": fuel.id,
        "occurred_at": "2026-06-10T20:05:00",
    }
    base.update(overrides)
    return base


def test_post_transaction_then_metrics_reflect_it(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    banco, fuel = _seed_accounts(db_session, user_id)
    app.dependency_overrides[get_session] = lambda: db_session
    try:
        client = TestClient(app)
        res = client.post(
            "/v1/insights/transactions",
            json=_payload(banco, fuel, note="Shell"),
            headers=_bearer(user_id),
        )
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["amount_minor"] == 50_000
        assert body["currency"] == "DOP"
        assert body["type"] == "expense"
        assert body["id"]

        res2 = client.get(
            "/v1/insights/metrics",
            params={"since": "2026-06-01", "until": "2026-06-30"},
            headers=_bearer(user_id),
        )
        assert res2.status_code == 200, res2.text
        by_cur = {b["currency"]: b for b in res2.json()["by_currency"]}
        assert by_cur["DOP"]["total_expenses_minor"] == 50_000
    finally:
        app.dependency_overrides.clear()


def test_post_transaction_is_idempotent(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    banco, fuel = _seed_accounts(db_session, user_id)
    app.dependency_overrides[get_session] = lambda: db_session
    try:
        client = TestClient(app)
        payload = _payload(banco, fuel, idempotency_key="idem-1")
        first = client.post("/v1/insights/transactions", json=payload, headers=_bearer(user_id))
        second = client.post("/v1/insights/transactions", json=payload, headers=_bearer(user_id))
        assert first.status_code == 201, first.text
        assert second.status_code == 201, second.text
        assert first.json()["id"] == second.json()["id"]  # no se duplicó (§12·C)
    finally:
        app.dependency_overrides.clear()


def test_post_transaction_unknown_account_is_404(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    app.dependency_overrides[get_session] = lambda: db_session
    try:
        client = TestClient(app)
        payload = {
            "type": "expense", "amount_minor": 50_000, "currency": "DOP",
            "account_id": str(uuid.uuid4()), "counter_account_id": str(uuid.uuid4()),
            "occurred_at": "2026-06-10T20:05:00",
        }
        res = client.post("/v1/insights/transactions", json=payload, headers=_bearer(user_id))
        assert res.status_code == 404, res.text
        assert res.json()["status"] == 404  # ProblemDetailDto
    finally:
        app.dependency_overrides.clear()


def test_post_transaction_cross_user_is_403(db_session: Session) -> None:
    owner = str(uuid.uuid4())
    attacker = str(uuid.uuid4())
    banco, fuel = _seed_accounts(db_session, owner)  # cuentas del owner
    app.dependency_overrides[get_session] = lambda: db_session
    try:
        client = TestClient(app)
        res = client.post(
            "/v1/insights/transactions",
            json=_payload(banco, fuel),
            headers=_bearer(attacker),  # otro usuario intenta moverlas
        )
        assert res.status_code == 403, res.text
    finally:
        app.dependency_overrides.clear()


def test_post_transaction_currency_mismatch_is_422(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    banco, fuel = _seed_accounts(db_session, user_id)  # cuentas DOP
    app.dependency_overrides[get_session] = lambda: db_session
    try:
        client = TestClient(app)
        res = client.post(
            "/v1/insights/transactions",
            json=_payload(banco, fuel, currency="USD"),  # no calza con las cuentas
            headers=_bearer(user_id),
        )
        assert res.status_code == 422, res.text
    finally:
        app.dependency_overrides.clear()


def test_metrics_without_token_is_401() -> None:
    client = TestClient(app)
    res = client.get(
        "/v1/insights/metrics", params={"since": "2026-06-01", "until": "2026-06-30"}
    )
    assert res.status_code == 401
    assert res.json()["status"] == 401
