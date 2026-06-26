"""Integration — endpoints de reportes `/v1/insights/reports/*` (HTTP + DB).

by-category (donut: gasto por categoría) e income-vs-expense (breakdown mensual). Ambos
derivan del ledger por SQL (§7.3, §12·B): las cifras NO las toca un LLM.
"""
from __future__ import annotations

import uuid
from datetime import datetime

import jwt
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.api.composition_root import get_session
from src.config import settings
from src.contexts.insights.domain.entities import Transaction, TransactionType
from src.contexts.insights.domain.ledger import Account, AccountType
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


def _move(txs, ledger, user_id, type_, account, counter, minor, when) -> None:  # type: ignore[no-untyped-def]
    tx = Transaction(
        str(uuid.uuid4()), user_id, type_, Money(minor, DOP), account.id, counter.id, when,
    )
    txs.add(tx)
    ledger.post(tx.to_journal_entry(), user_id, tx.id)


def test_report_by_category_is_sorted_desc(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    accounts = SqlAccountRepository(db_session)
    ledger = SqlLedgerRepository(db_session)
    txs = SqlTransactionRepository(db_session)

    banco = Account(str(uuid.uuid4()), user_id, AccountType.ASSET, DOP, "Banco")
    fuel = Account(str(uuid.uuid4()), user_id, AccountType.EXPENSE, DOP, "Combustible")
    food = Account(str(uuid.uuid4()), user_id, AccountType.EXPENSE, DOP, "Comida")
    for acc in (banco, fuel, food):
        accounts.add(acc)
    _move(txs, ledger, user_id, TransactionType.EXPENSE, banco, fuel, 50_000, datetime(2026, 6, 5, 9))
    _move(txs, ledger, user_id, TransactionType.EXPENSE, banco, fuel, 30_000, datetime(2026, 6, 10, 9))
    _move(txs, ledger, user_id, TransactionType.EXPENSE, banco, food, 20_000, datetime(2026, 6, 8, 9))

    app.dependency_overrides[get_session] = lambda: db_session
    try:
        res = TestClient(app).get(
            "/v1/insights/reports/by-category",
            params={"since": "2026-06-01", "until": "2026-06-30"},
            headers=_bearer(user_id),
        )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["kind"] == "expense"
    cats = body["by_category"]
    assert [c["name"] for c in cats] == ["Combustible", "Comida"]   # desc por total
    assert cats[0]["total_minor"] == 80_000                          # 50,000 + 30,000
    assert cats[1]["total_minor"] == 20_000
    assert cats[0]["currency"] == "DOP"


def test_report_income_vs_expense_by_month(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    accounts = SqlAccountRepository(db_session)
    ledger = SqlLedgerRepository(db_session)
    txs = SqlTransactionRepository(db_session)

    banco = Account(str(uuid.uuid4()), user_id, AccountType.ASSET, DOP, "Banco")
    salary = Account(str(uuid.uuid4()), user_id, AccountType.INCOME, DOP, "Salary")
    fuel = Account(str(uuid.uuid4()), user_id, AccountType.EXPENSE, DOP, "Combustible")
    for acc in (banco, salary, fuel):
        accounts.add(acc)
    # Mayo
    _move(txs, ledger, user_id, TransactionType.INCOME, banco, salary, 200_000, datetime(2026, 5, 15, 9))
    _move(txs, ledger, user_id, TransactionType.EXPENSE, banco, fuel, 50_000, datetime(2026, 5, 10, 9))
    # Junio
    _move(txs, ledger, user_id, TransactionType.INCOME, banco, salary, 200_000, datetime(2026, 6, 15, 9))
    _move(txs, ledger, user_id, TransactionType.EXPENSE, banco, fuel, 80_000, datetime(2026, 6, 20, 9))

    app.dependency_overrides[get_session] = lambda: db_session
    try:
        res = TestClient(app).get(
            "/v1/insights/reports/income-vs-expense",
            params={"since": "2026-05-01", "until": "2026-06-30"},
            headers=_bearer(user_id),
        )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 200, res.text
    by_month = {(b["month"], b["currency"]): b for b in res.json()["by_month"]}
    assert by_month[("2026-05", "DOP")]["income_minor"] == 200_000   # income volteado a +
    assert by_month[("2026-05", "DOP")]["expense_minor"] == 50_000
    assert by_month[("2026-06", "DOP")]["income_minor"] == 200_000
    assert by_month[("2026-06", "DOP")]["expense_minor"] == 80_000


def test_reports_without_token_is_401() -> None:
    res = TestClient(app).get(
        "/v1/insights/reports/by-category",
        params={"since": "2026-06-01", "until": "2026-06-30"},
    )
    assert res.status_code == 401
