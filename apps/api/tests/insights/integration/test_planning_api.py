"""Integration — endpoints de planificación `/v1/insights/*` (HTTP + DB).

Cubre los creators thin expuestos: POST /budgets, /spaces, /savings-goals, /recurring-rules
(201 con su DTO) y el gate RBAC §12.1 (cuenta ajena → 403). La sesión transaccional del
test se inyecta vía dependency_override.
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


def _account(session: Session, user_id: str, type_: AccountType, name: str) -> Account:
    acc = Account(str(uuid.uuid4()), user_id, type_, DOP, name)
    SqlAccountRepository(session).add(acc)
    return acc


def test_post_budget_returns_201(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    fuel = _account(db_session, user_id, AccountType.EXPENSE, "Combustible")
    app.dependency_overrides[get_session] = lambda: db_session
    try:
        client = TestClient(app)
        res = client.post(
            "/v1/insights/budgets",
            json={
                "category_account_id": fuel.id,
                "limit_minor": 300_000,
                "currency": "DOP",
                "period": "monthly",
            },
            headers=_bearer(user_id),
        )
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["limit_minor"] == 300_000
        assert body["period"] == "monthly"
        assert body["alert_thresholds"] == [70, 85, 100]
        assert body["id"]
    finally:
        app.dependency_overrides.clear()


def test_post_budget_cross_user_account_is_403(db_session: Session) -> None:
    owner = str(uuid.uuid4())
    attacker = str(uuid.uuid4())
    fuel = _account(db_session, owner, AccountType.EXPENSE, "Combustible")
    app.dependency_overrides[get_session] = lambda: db_session
    try:
        client = TestClient(app)
        res = client.post(
            "/v1/insights/budgets",
            json={
                "category_account_id": fuel.id,
                "limit_minor": 300_000,
                "currency": "DOP",
                "period": "monthly",
            },
            headers=_bearer(attacker),
        )
        assert res.status_code == 403, res.text
    finally:
        app.dependency_overrides.clear()


def test_post_space_returns_201(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    banco = _account(db_session, user_id, AccountType.ASSET, "Banco")
    app.dependency_overrides[get_session] = lambda: db_session
    try:
        client = TestClient(app)
        res = client.post(
            "/v1/insights/spaces",
            json={"name": "Hogar", "account_ids": [banco.id]},
            headers=_bearer(user_id),
        )
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["name"] == "Hogar"
        assert body["account_ids"] == [banco.id]
    finally:
        app.dependency_overrides.clear()


def test_post_savings_goal_returns_201(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    app.dependency_overrides[get_session] = lambda: db_session
    try:
        client = TestClient(app)
        res = client.post(
            "/v1/insights/savings-goals",
            json={"name": "Viaje", "target_minor": 10_000_000, "currency": "DOP"},
            headers=_bearer(user_id),
        )
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["name"] == "Viaje"
        assert body["target_minor"] == 10_000_000
        assert body["account_id"] is None
    finally:
        app.dependency_overrides.clear()


def test_post_recurring_rule_returns_201(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    banco = _account(db_session, user_id, AccountType.ASSET, "Banco")
    subs = _account(db_session, user_id, AccountType.EXPENSE, "Subscriptions")
    app.dependency_overrides[get_session] = lambda: db_session
    try:
        client = TestClient(app)
        res = client.post(
            "/v1/insights/recurring-rules",
            json={
                "type": "expense",
                "amount_minor": 35_000,
                "currency": "DOP",
                "account_id": banco.id,
                "counter_account_id": subs.id,
                "cadence": "monthly",
                "next_run": "2026-07-01",
                "note": "Spotify",
            },
            headers=_bearer(user_id),
        )
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["cadence"] == "monthly"
        assert body["active"] is True
        assert body["next_run"] == "2026-07-01"
    finally:
        app.dependency_overrides.clear()


def test_post_budget_without_token_is_401() -> None:
    client = TestClient(app)
    res = client.post(
        "/v1/insights/budgets",
        json={"category_account_id": str(uuid.uuid4()), "limit_minor": 1, "currency": "DOP", "period": "monthly"},
    )
    assert res.status_code == 401
    assert res.json()["status"] == 401
