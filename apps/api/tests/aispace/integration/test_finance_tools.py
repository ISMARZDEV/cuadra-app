"""Integration — tool register_transaction del FinanceAgent (HTTP-less, DB real).

Verifica el contrato de la tool: liga user_id por closure (anti-IDOR §12.1), resuelve la
wallet del usuario, get-or-create de la categoría por nombre, y persiste vía el use case
RecordTransaction de Insights (UoW propia, D1/D2). El LLM NO interviene en este test.
"""
from __future__ import annotations

import uuid
from contextlib import contextmanager

from sqlalchemy.orm import Session

from src.contexts.aispace.agents.finance.tools.transactions import (
    FinanceToolError,
    execute_register_transaction,
)
from src.contexts.insights.domain.ledger import Account, AccountType
from src.contexts.insights.infrastructure.metrics import SqlInsightsMetricsRepository
from src.contexts.insights.infrastructure.repositories import SqlAccountRepository
from src.shared.money import Currency

DOP = Currency("DOP")


def _factory(session: Session):  # type: ignore[no-untyped-def]
    @contextmanager
    def _f():
        yield session  # el fixture hace rollback; la tool puede commitear (savepoint)
    return _f


def test_register_transaction_resolves_wallet_and_category(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    accounts = SqlAccountRepository(db_session)
    banco = Account(str(uuid.uuid4()), user_id, AccountType.ASSET, DOP, "Banco")
    accounts.add(banco)  # wallet primaria

    result = execute_register_transaction(
        user_id, _factory(db_session), amount=500, category="Gasolina", merchant="Shell"
    )

    assert result["amount_minor"] == 50_000          # 500 → minor en código, no LLM
    assert result["category"] == "Gasolina"
    assert result["wallet"] == "Banco"
    # la categoría se creó (get-or-create) como cuenta expense del usuario
    cats = [a for a in accounts.list_by_user(user_id) if a.type is AccountType.EXPENSE]
    assert {c.name for c in cats} == {"Gasolina"}
    # el gasto bajó el saldo de la wallet
    balances = SqlInsightsMetricsRepository(db_session).balances_by_account(user_id)
    assert balances[banco.id] == -50_000


def test_register_transaction_reuses_existing_category(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    accounts = SqlAccountRepository(db_session)
    accounts.add(Account(str(uuid.uuid4()), user_id, AccountType.ASSET, DOP, "Banco"))
    accounts.add(Account(str(uuid.uuid4()), user_id, AccountType.EXPENSE, DOP, "Comida"))

    execute_register_transaction(user_id, _factory(db_session), amount=200, category="Comida")

    cats = [a for a in accounts.list_by_user(user_id) if a.type is AccountType.EXPENSE]
    assert len(cats) == 1  # NO duplicó la categoría


def test_register_transaction_without_wallet_raises(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    try:
        execute_register_transaction(user_id, _factory(db_session), amount=500, category="Gasolina")
        raised = False
    except FinanceToolError:
        raised = True
    assert raised  # sin wallet → error claro, no inventa cuentas


def _add_wallet(session: Session, user_id: str, code: str, name: str) -> Account:
    w = Account(str(uuid.uuid4()), user_id, AccountType.ASSET, Currency(code), name)
    SqlAccountRepository(session).add(w)
    return w


def test_register_uses_currency_specific_wallet(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    _add_wallet(db_session, user_id, "DOP", "Banco")
    _add_wallet(db_session, user_id, "USD", "USD Account")

    r = execute_register_transaction(
        user_id, _factory(db_session), amount=50, category="Gas", currency="USD"
    )
    assert r["currency"] == "USD"
    assert r["display"] == "USD 50.00"        # se registró en la wallet USD, no en DOP


def test_register_currency_without_matching_wallet_raises(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    _add_wallet(db_session, user_id, "DOP", "Banco")  # solo DOP
    try:
        execute_register_transaction(
            user_id, _factory(db_session), amount=50, category="Gas", currency="USD"
        )
        raised = False
    except FinanceToolError:
        raised = True
    assert raised  # pidió USD sin wallet USD → error claro, no registra en otra moneda


def test_register_zero_decimal_currency_no_x100(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    _add_wallet(db_session, user_id, "JPY", "Japan")
    r = execute_register_transaction(
        user_id, _factory(db_session), amount=500, category="Food", currency="JPY"
    )
    assert r["amount_minor"] == 500           # 0 decimales → ×1, NO ×100
    assert r["display"] == "JPY 500"


def test_commit_localizes_tool_error(db_session: Session) -> None:
    """Sin wallet en la moneda → commit captura FinanceToolError y lo localiza (no crash)."""
    from src.contexts.aispace.agents.finance.agent import FinanceAgent

    user_id = str(uuid.uuid4())
    _add_wallet(db_session, user_id, "DOP", "Banco")  # solo DOP
    agent = FinanceAgent(_factory(db_session))
    state = {
        "user_id": user_id,
        "language": "en",
        "pending_action": {"amount": 50, "category": "Gas", "currency": "USD"},
    }
    reply = agent.commit(state)
    assert "USD wallet" in reply        # mensaje localizado en inglés, no español ni traceback


def test_register_income_increases_wallet(db_session: Session) -> None:
    """kind='income' → entra dinero a la wallet (no sale, como el gasto)."""
    user_id = str(uuid.uuid4())
    banco = _add_wallet(db_session, user_id, "DOP", "Banco")
    r = execute_register_transaction(
        user_id, _factory(db_session), amount=20000, category="Salary", kind="income"
    )
    assert r["amount_minor"] == 2_000_000
    bal = SqlInsightsMetricsRepository(db_session).balances_by_account(user_id)
    assert bal[banco.id] == 2_000_000      # ingreso → saldo SUBE (gasto bajaría)
    cats = [a for a in SqlAccountRepository(db_session).list_by_user(user_id)]
    assert any(a.name == "Salary" and a.type is AccountType.INCOME for a in cats)


def test_get_safe_to_spend_tool(db_session: Session) -> None:
    """La tool de safe-to-spend devuelve datos del daily-target (reusa GetDailyTarget)."""
    from src.contexts.aispace.agents.finance.tools.metrics import build_get_safe_to_spend
    from src.contexts.insights.domain.entities import Budget, BudgetPeriod
    from src.contexts.insights.infrastructure.planning import SqlBudgetRepository
    from src.shared.money import Money

    user_id = str(uuid.uuid4())
    fuel = Account(str(uuid.uuid4()), user_id, AccountType.EXPENSE, DOP, "Gasolina")
    SqlAccountRepository(db_session).add(fuel)
    SqlBudgetRepository(db_session).add(
        Budget(str(uuid.uuid4()), user_id, fuel.id, Money(600_000, DOP), BudgetPeriod.MONTHLY)
    )
    tool = build_get_safe_to_spend(user_id, _factory(db_session))
    out = tool.invoke({})
    assert "safe_to_spend_today" in out and "DOP" in out
