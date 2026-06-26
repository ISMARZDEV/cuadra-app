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
