"""Integration — endpoints de LECTURA de Insights (HTTP + DB).

Alimentan el carrusel Home y las listas del navbar: GET /accounts (wallets + saldo),
/transactions (recientes), /spaces, /budgets, /savings-goals. Lecturas thin sobre los
repos; el saldo de cada wallet se DERIVA del ledger (§12·B).
"""
from __future__ import annotations

import uuid
from datetime import datetime

import jwt
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.api.composition_root import get_session
from src.config import settings
from src.contexts.insights.domain.entities import (
    Budget,
    BudgetPeriod,
    SavingsGoal,
    Space,
    Transaction,
    TransactionType,
)
from src.contexts.insights.domain.ledger import (
    Account,
    AccountType,
    JournalEntry,
    Posting,
)
from src.contexts.insights.infrastructure.planning import (
    SqlBudgetRepository,
    SqlSavingsGoalRepository,
    SqlSpaceRepository,
)
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


def _client(db_session: Session) -> TestClient:
    app.dependency_overrides[get_session] = lambda: db_session
    return TestClient(app)


def test_get_accounts_returns_wallets_with_balance(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    accounts = SqlAccountRepository(db_session)
    ledger = SqlLedgerRepository(db_session)

    banco = Account(str(uuid.uuid4()), user_id, AccountType.ASSET, DOP, "Banco")
    tarjeta = Account(str(uuid.uuid4()), user_id, AccountType.LIABILITY, DOP, "Tarjeta")
    fuel = Account(str(uuid.uuid4()), user_id, AccountType.EXPENSE, DOP, "Combustible")
    opening = Account(str(uuid.uuid4()), user_id, AccountType.EQUITY, DOP, "Opening Balance")
    for acc in (banco, tarjeta, fuel, opening):
        accounts.add(acc)
    # saldo inicial de Banco: $5,000 vía equity
    ledger.post(
        JournalEntry(
            "je-open", datetime(2026, 6, 1).date(), "Opening · Banco",
            (Posting(banco.id, Money(500_000, DOP)), Posting(opening.id, Money(-500_000, DOP))),
        ),
        user_id,
    )

    try:
        res = _client(db_session).get("/v1/insights/accounts", headers=_bearer(user_id))
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 200, res.text
    by_name = {a["name"]: a for a in res.json()}
    assert set(by_name) == {"Banco", "Tarjeta"}        # categorías y equity NO son wallets
    assert by_name["Banco"]["balance_minor"] == 500_000
    assert by_name["Banco"]["type"] == "asset"
    assert by_name["Tarjeta"]["balance_minor"] == 0


def test_get_transactions_returns_recent_first_limited(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    accounts = SqlAccountRepository(db_session)
    txs = SqlTransactionRepository(db_session)
    banco = Account(str(uuid.uuid4()), user_id, AccountType.ASSET, DOP, "Banco")
    fuel = Account(str(uuid.uuid4()), user_id, AccountType.EXPENSE, DOP, "Combustible")
    accounts.add(banco)
    accounts.add(fuel)
    for day, minor in ((5, 10_000), (10, 20_000), (15, 30_000)):
        txs.add(
            Transaction(
                str(uuid.uuid4()), user_id, TransactionType.EXPENSE, Money(minor, DOP),
                banco.id, fuel.id, datetime(2026, 6, day, 12, 0),
            )
        )

    try:
        res = _client(db_session).get(
            "/v1/insights/transactions", params={"limit": 2}, headers=_bearer(user_id)
        )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 200, res.text
    body = res.json()
    assert len(body) == 2                                  # respeta limit
    assert body[0]["amount_minor"] == 30_000              # más reciente primero (día 15)
    assert body[1]["amount_minor"] == 20_000              # luego día 10


def test_get_spaces_lists_user_spaces(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    spaces = SqlSpaceRepository(db_session)
    spaces.add(Space(str(uuid.uuid4()), user_id, "Hogar"))
    spaces.add(Space(str(uuid.uuid4()), user_id, "Negocio"))

    try:
        res = _client(db_session).get("/v1/insights/spaces", headers=_bearer(user_id))
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 200, res.text
    assert {s["name"] for s in res.json()} == {"Hogar", "Negocio"}


def test_get_budgets_lists_user_budgets(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    accounts = SqlAccountRepository(db_session)
    budgets = SqlBudgetRepository(db_session)
    fuel = Account(str(uuid.uuid4()), user_id, AccountType.EXPENSE, DOP, "Combustible")
    accounts.add(fuel)
    budgets.add(
        Budget(str(uuid.uuid4()), user_id, fuel.id, Money(300_000, DOP), BudgetPeriod.MONTHLY)
    )

    try:
        res = _client(db_session).get("/v1/insights/budgets", headers=_bearer(user_id))
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 200, res.text
    body = res.json()
    assert len(body) == 1
    assert body[0]["limit_minor"] == 300_000
    assert body[0]["alert_thresholds"] == [70, 85, 100]


def test_get_savings_goals_lists_user_goals(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    goals = SqlSavingsGoalRepository(db_session)
    goals.add(SavingsGoal(str(uuid.uuid4()), user_id, "Viaje", Money(10_000_000, DOP)))

    try:
        res = _client(db_session).get("/v1/insights/savings-goals", headers=_bearer(user_id))
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 200, res.text
    body = res.json()
    assert len(body) == 1
    assert body[0]["name"] == "Viaje"
    assert body[0]["target_minor"] == 10_000_000


def test_get_accounts_without_token_is_401() -> None:
    res = TestClient(app).get("/v1/insights/accounts")
    assert res.status_code == 401
    assert res.json()["status"] == 401
