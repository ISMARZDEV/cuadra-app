"""Integration — vista de suscripciones: GET /v1/insights/recurring-rules (HTTP + DB).

Lista las reglas recurrentes del usuario (suscripciones); con `due_by` filtra a las
vencidas a una fecha (alimenta bill reminders / próximos pagos).
"""
from __future__ import annotations

import uuid
from datetime import date

import jwt
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.api.composition_root import get_session
from src.config import settings
from src.contexts.insights.domain.entities import Cadence, RecurringRule, TransactionType
from src.contexts.insights.domain.ledger import Account, AccountType
from src.contexts.insights.infrastructure.planning import SqlRecurringRuleRepository
from src.contexts.insights.infrastructure.repositories import SqlAccountRepository
from src.main import app
from src.shared.money import Currency, Money

DOP = Currency("DOP")


def _bearer(user_id: str) -> dict[str, str]:
    token = jwt.encode({"sub": user_id}, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}


def _seed_rules(db_session: Session, user_id: str) -> None:
    accounts = SqlAccountRepository(db_session)
    rules = SqlRecurringRuleRepository(db_session)
    banco = Account(str(uuid.uuid4()), user_id, AccountType.ASSET, DOP, "Banco")
    subs = Account(str(uuid.uuid4()), user_id, AccountType.EXPENSE, DOP, "Subscriptions")
    accounts.add(banco)
    accounts.add(subs)
    rules.add(RecurringRule(
        str(uuid.uuid4()), user_id, TransactionType.EXPENSE, Money(35_000, DOP),
        banco.id, subs.id, Cadence.MONTHLY, date(2026, 7, 1), note="Spotify",
    ))
    rules.add(RecurringRule(
        str(uuid.uuid4()), user_id, TransactionType.EXPENSE, Money(1_500_000, DOP),
        banco.id, subs.id, Cadence.MONTHLY, date(2026, 6, 15), note="Renta",
    ))


def test_list_recurring_rules_returns_all(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    _seed_rules(db_session, user_id)
    app.dependency_overrides[get_session] = lambda: db_session
    try:
        res = TestClient(app).get("/v1/insights/recurring-rules", headers=_bearer(user_id))
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 200, res.text
    assert {r["note"] for r in res.json()} == {"Spotify", "Renta"}


def test_list_recurring_rules_due_by_filters(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    _seed_rules(db_session, user_id)
    app.dependency_overrides[get_session] = lambda: db_session
    try:
        res = TestClient(app).get(
            "/v1/insights/recurring-rules",
            params={"due_by": "2026-06-30"},  # solo Renta (next_run 06-15); Spotify es 07-01
            headers=_bearer(user_id),
        )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 200, res.text
    body = res.json()
    assert [r["note"] for r in body] == ["Renta"]


def test_recurring_rules_without_token_is_401() -> None:
    res = TestClient(app).get("/v1/insights/recurring-rules")
    assert res.status_code == 401
