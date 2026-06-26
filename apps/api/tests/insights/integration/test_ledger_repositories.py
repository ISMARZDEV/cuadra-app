"""Integration — repos del ledger de Insights contra la DB real (schema `insights`).

Prueba el flujo completo de §12·B bajado a Postgres: crear cuentas, registrar
transacciones (que generan asientos balanceados) y DERIVAR el saldo por SQL
(`Σ posting.amount_minor`), nunca de una columna mutable.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from src.contexts.insights.domain.entities import (
    Merchant,
    Transaction,
    TransactionSource,
    TransactionType,
)
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


def test_account_repository_roundtrip(db_session: Session) -> None:
    repo = SqlAccountRepository(db_session)
    banco = _acc(AccountType.ASSET, "Banco")
    repo.add(banco)
    assert repo.get_by_id(banco.id) == banco  # frozen dataclass → igualdad por valor


def test_list_accounts_by_user(db_session: Session) -> None:
    repo = SqlAccountRepository(db_session)
    banco = _acc(AccountType.ASSET, "Banco")
    salary = _acc(AccountType.INCOME, "Salary")
    repo.add(banco)
    repo.add(salary)
    ids = {a.id for a in repo.list_by_user(USER)}
    assert {banco.id, salary.id} <= ids


def test_post_transactions_and_derive_balance(db_session: Session) -> None:
    accounts = SqlAccountRepository(db_session)
    ledger = SqlLedgerRepository(db_session)
    txs = SqlTransactionRepository(db_session)

    banco = _acc(AccountType.ASSET, "Banco")
    salary = _acc(AccountType.INCOME, "Salary")
    combustible = _acc(AccountType.EXPENSE, "Combustible")
    for acc in (banco, salary, combustible):
        accounts.add(acc)

    # salario +$20,000
    tx_in = Transaction(
        str(uuid.uuid4()), USER, TransactionType.INCOME, Money(2_000_000, DOP),
        banco.id, salary.id, datetime(2026, 6, 1, 9, 0),
    )
    txs.add(tx_in)
    ledger.post(tx_in.to_journal_entry(), USER, tx_in.id)

    # Shell −$500
    tx_out = Transaction(
        str(uuid.uuid4()), USER, TransactionType.EXPENSE, Money(50_000, DOP),
        banco.id, combustible.id, datetime(2026, 6, 10, 20, 5),
    )
    txs.add(tx_out)
    ledger.post(tx_out.to_journal_entry(), USER, tx_out.id)

    assert ledger.balance_of(banco) == Money(1_950_000, DOP)
    assert ledger.balance_of(salary) == Money(-2_000_000, DOP)
    assert ledger.balance_of(combustible) == Money(50_000, DOP)


def test_transaction_roundtrip_preserves_enrichment(db_session: Session) -> None:
    accounts = SqlAccountRepository(db_session)
    txs = SqlTransactionRepository(db_session)
    banco = _acc(AccountType.ASSET, "Banco")
    subs = _acc(AccountType.EXPENSE, "Subscriptions")
    accounts.add(banco)
    accounts.add(subs)

    tx = Transaction(
        str(uuid.uuid4()), USER, TransactionType.EXPENSE, Money(35_000, DOP),
        banco.id, subs.id, datetime(2026, 6, 10, 0, 5),
        source=TransactionSource.VOICE,
        merchant=Merchant("Spotify", "https://logo/spotify.png"),
        idempotency_key=str(uuid.uuid4()),
        recurring=True,
    )
    txs.add(tx)
    got = txs.get_by_id(tx.id)

    assert got is not None
    assert got.amount == Money(35_000, DOP)
    assert got.merchant is not None and got.merchant.name == "Spotify"
    assert got.source is TransactionSource.VOICE
    assert got.recurring is True
