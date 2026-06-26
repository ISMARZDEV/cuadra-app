"""Integration — RecordTransaction cableado con los repos SQL reales (write path E2E).

Prueba que los repos SQL satisfacen los puertos y que la idempotencia (§12·C) funciona
contra la DB: reenviar la misma `idempotency_key` NO duplica el movimiento ni el saldo.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from src.contexts.insights.application.transactions import RecordTransaction
from src.contexts.insights.domain.entities import Transaction, TransactionType
from src.contexts.insights.domain.ledger import Account, AccountType
from src.contexts.insights.infrastructure.repositories import (
    SqlAccountRepository,
    SqlLedgerRepository,
    SqlTransactionRepository,
)
from src.shared.money import Currency, Money

DOP = Currency("DOP")
USER = str(uuid.uuid4())


def _acc(type_: AccountType, name: str) -> Account:
    return Account(str(uuid.uuid4()), USER, type_, DOP, name)


def test_record_transaction_e2e_is_idempotent(db_session: Session) -> None:
    accounts = SqlAccountRepository(db_session)
    ledger = SqlLedgerRepository(db_session)
    txs = SqlTransactionRepository(db_session)
    use_case = RecordTransaction(accounts, txs, ledger)

    banco = _acc(AccountType.ASSET, "Banco")
    fuel = _acc(AccountType.EXPENSE, "Combustible")
    accounts.add(banco)
    accounts.add(fuel)

    def _shell() -> Transaction:
        return Transaction(
            str(uuid.uuid4()), USER, TransactionType.EXPENSE, Money(50_000, DOP),
            banco.id, fuel.id, datetime(2026, 6, 10, 20, 5),
            idempotency_key="idem-shell-1",
        )

    first = use_case.execute(_shell())
    second = use_case.execute(_shell())  # mismo idempotency_key, distinto id

    assert second.id == first.id          # devolvió la existente
    # el saldo NO se duplicó: un solo gasto de −500
    assert ledger.balance_of(banco) == Money(-50_000, DOP)
    assert ledger.balance_of(fuel) == Money(50_000, DOP)
