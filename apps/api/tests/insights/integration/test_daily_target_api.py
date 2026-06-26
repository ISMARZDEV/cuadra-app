"""Integration — endpoint GET /v1/insights/daily-target (HTTP + DB).

Reproduce un mes con presupuesto y gastos, y verifica que el endpoint deriva del ledger
"cuánto puedo gastar hoy" y "lo gastado hoy" por moneda (card ③). Cifras en minor units.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime

import jwt
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.api.composition_root import get_session
from src.config import settings
from src.contexts.insights.domain.entities import (
    Budget,
    BudgetPeriod,
    Transaction,
    TransactionType,
)
from src.contexts.insights.domain.ledger import Account, AccountType
from src.contexts.insights.infrastructure.planning import SqlBudgetRepository
from src.contexts.insights.infrastructure.repositories import (
    SqlAccountRepository,
    SqlLedgerRepository,
    SqlTransactionRepository,
)
from src.main import app
from src.shared.money import Currency, Money

DOP = Currency("DOP")


def _bearer(user_id: str) -> dict[str, str]:
    token = jwt.encode({"sub": user_id}, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}


def _expense(txs, ledger, user_id, account, counter, minor, when) -> None:  # type: ignore[no-untyped-def]
    tx = Transaction(
        str(uuid.uuid4()), user_id, TransactionType.EXPENSE, Money(minor, DOP),
        account.id, counter.id, when,
    )
    txs.add(tx)
    ledger.post(tx.to_journal_entry(), user_id, tx.id)


def test_daily_target_endpoint_derives_from_budget_and_ledger(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    accounts = SqlAccountRepository(db_session)
    budgets = SqlBudgetRepository(db_session)
    ledger = SqlLedgerRepository(db_session)
    txs = SqlTransactionRepository(db_session)

    banco = Account(str(uuid.uuid4()), user_id, AccountType.ASSET, DOP, "Banco")
    fuel = Account(str(uuid.uuid4()), user_id, AccountType.EXPENSE, DOP, "Combustible")
    accounts.add(banco)
    accounts.add(fuel)
    # presupuesto mensual RD$6,000 sobre la categoría
    budgets.add(
        Budget(str(uuid.uuid4()), user_id, fuel.id, Money(600_000, DOP), BudgetPeriod.MONTHLY)
    )
    # gastos del mes: $1,800 el día 5 y $500 hoy (día 10)
    _expense(txs, ledger, user_id, banco, fuel, 180_000, datetime(2026, 6, 5, 12, 0))
    _expense(txs, ledger, user_id, banco, fuel, 50_000, datetime(2026, 6, 10, 20, 0))

    app.dependency_overrides[get_session] = lambda: db_session
    try:
        client = TestClient(app)
        res = client.get(
            "/v1/insights/daily-target",
            params={"as_of": "2026-06-10"},  # quedan 21 días
            headers=_bearer(user_id),
        )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 200, res.text
    dop = {b["currency"]: b for b in res.json()["by_currency"]}["DOP"]
    assert dop["monthly_limit_minor"] == 600_000
    assert dop["spent_month_minor"] == 230_000          # 180,000 + 50,000
    assert dop["remaining_minor"] == 370_000            # 600,000 − 230,000
    assert dop["days_remaining"] == 21
    assert dop["daily_target_minor"] == 370_000 // 21   # 17,619
    assert dop["spent_today_minor"] == 50_000           # solo el gasto del día 10


def test_daily_target_without_token_is_401() -> None:
    client = TestClient(app)
    res = client.get("/v1/insights/daily-target", params={"as_of": "2026-06-10"})
    assert res.status_code == 401
    assert res.json()["status"] == 401
