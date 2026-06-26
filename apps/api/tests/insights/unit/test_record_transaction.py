"""Unit — use case RecordTransaction (write path) con repos FALSOS (sin DB).

Orquesta: validar cuentas (existen · son del usuario · moneda calza) → persistir la
transacción → postear su asiento balanceado. Idempotencia (§12·C): reenviar la misma
`idempotency_key` NO duplica el movimiento. RBAC mínimo privilegio (§12.1): no se puede
postear contra la cuenta de otro usuario.
"""
from __future__ import annotations

from datetime import datetime

import pytest

from src.contexts.insights.application.errors import (
    AccountNotFoundError,
    CrossUserAccountError,
    TransactionCurrencyError,
)
from src.contexts.insights.application.transactions import RecordTransaction
from src.contexts.insights.domain.entities import Transaction, TransactionType
from src.contexts.insights.domain.ledger import Account, AccountType
from src.shared.money import Currency, Money

DOP = Currency("DOP")
USD = Currency("USD")
WHEN = datetime(2026, 6, 10, 20, 5)

BANCO = Account("acc-banco", "u1", AccountType.ASSET, DOP, "Banco")
COMBUSTIBLE = Account("acc-fuel", "u1", AccountType.EXPENSE, DOP, "Combustible")
OTHER_USER_ACC = Account("acc-other", "u2", AccountType.EXPENSE, DOP, "De otro")
USD_CATEGORY = Account("acc-usd-cat", "u1", AccountType.EXPENSE, USD, "Dining USD")


class FakeAccounts:
    def __init__(self, *accounts: Account) -> None:
        self._by_id = {a.id: a for a in accounts}

    def add(self, account: Account) -> None:
        self._by_id[account.id] = account

    def get_by_id(self, account_id: str) -> Account | None:
        return self._by_id.get(account_id)

    def list_by_user(self, user_id: str) -> list[Account]:
        return [a for a in self._by_id.values() if a.user_id == user_id]


class FakeTransactions:
    def __init__(self) -> None:
        self.added: list[Transaction] = []
        self._by_key: dict[tuple[str, str], Transaction] = {}

    def add(self, tx: Transaction) -> None:
        self.added.append(tx)
        if tx.idempotency_key:
            self._by_key[(tx.user_id, tx.idempotency_key)] = tx

    def get_by_id(self, tx_id: str) -> Transaction | None:
        return next((t for t in self.added if t.id == tx_id), None)

    def get_by_idempotency_key(self, user_id: str, key: str) -> Transaction | None:
        return self._by_key.get((user_id, key))


class FakeLedger:
    def __init__(self) -> None:
        self.posted: list[tuple[object, str, str | None]] = []

    def post(self, entry: object, user_id: str, transaction_id: str | None = None) -> None:
        self.posted.append((entry, user_id, transaction_id))

    def balance_of(self, account: Account) -> Money:  # no usado aquí
        return Money.zero(account.currency)


def _expense(amount: Money, *, key: str | None = None) -> Transaction:
    return Transaction(
        id="tx-1",
        user_id="u1",
        type=TransactionType.EXPENSE,
        amount=amount,
        account_id=BANCO.id,
        counter_account_id=COMBUSTIBLE.id,
        occurred_at=WHEN,
        idempotency_key=key,
    )


def test_records_transaction_and_posts_balanced_entry() -> None:
    accounts = FakeAccounts(BANCO, COMBUSTIBLE)
    txs = FakeTransactions()
    ledger = FakeLedger()
    use_case = RecordTransaction(accounts, txs, ledger)

    result = use_case.execute(_expense(Money(50_000, DOP)))

    assert result.id == "tx-1"
    assert len(txs.added) == 1
    assert len(ledger.posted) == 1
    entry, user_id, tx_id = ledger.posted[0]
    assert user_id == "u1" and tx_id == "tx-1"
    assert len(entry.postings) == 2  # asiento balanceado generado


def test_idempotent_resend_does_not_double_post() -> None:
    accounts = FakeAccounts(BANCO, COMBUSTIBLE)
    txs = FakeTransactions()
    ledger = FakeLedger()
    use_case = RecordTransaction(accounts, txs, ledger)

    first = use_case.execute(_expense(Money(50_000, DOP), key="idem-1"))
    second = use_case.execute(_expense(Money(50_000, DOP), key="idem-1"))

    assert second is first
    assert len(txs.added) == 1     # NO duplicó
    assert len(ledger.posted) == 1  # NO posteó dos veces


def test_unknown_account_raises() -> None:
    accounts = FakeAccounts(BANCO)  # falta COMBUSTIBLE
    use_case = RecordTransaction(accounts, FakeTransactions(), FakeLedger())
    with pytest.raises(AccountNotFoundError):
        use_case.execute(_expense(Money(50_000, DOP)))


def test_account_of_another_user_raises() -> None:
    # counter pertenece a u2 → RBAC §12.1
    accounts = FakeAccounts(BANCO, OTHER_USER_ACC)
    tx = Transaction(
        "tx-2", "u1", TransactionType.EXPENSE, Money(50_000, DOP),
        BANCO.id, OTHER_USER_ACC.id, WHEN,
    )
    use_case = RecordTransaction(accounts, FakeTransactions(), FakeLedger())
    with pytest.raises(CrossUserAccountError):
        use_case.execute(tx)


def test_currency_mismatch_between_amount_and_account_raises() -> None:
    # monto USD pero cuentas DOP (MVP single-currency; FX diferido)
    accounts = FakeAccounts(BANCO, COMBUSTIBLE)
    use_case = RecordTransaction(accounts, FakeTransactions(), FakeLedger())
    with pytest.raises(TransactionCurrencyError):
        use_case.execute(_expense(Money(50_000, USD)))
