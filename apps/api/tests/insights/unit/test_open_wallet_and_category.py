"""Unit — OpenWallet y CreateCategory (write path de creación) con repos FALSOS.

OpenWallet: crea una wallet (asset/liability) y, si trae saldo inicial, postea el asiento
de apertura vía una cuenta `equity` "Opening Balance" (insights-ledger.md ①). La equity se
reusa (una por moneda). CreateCategory: crea una categoría (income/expense) con ícono (⊕).
"""
from __future__ import annotations

from datetime import date

import pytest

from src.contexts.insights.application.accounts import CreateCategory, OpenWallet
from src.contexts.insights.domain.ledger import Account, AccountType
from src.shared.money import Currency, Money

DOP = Currency("DOP")
USER = "u1"


class FakeAccounts:
    def __init__(self) -> None:
        self._by_id: dict[str, Account] = {}

    def add(self, account: Account) -> None:
        self._by_id[account.id] = account

    def get_by_id(self, account_id: str) -> Account | None:
        return self._by_id.get(account_id)

    def list_by_user(self, user_id: str) -> list[Account]:
        return [a for a in self._by_id.values() if a.user_id == user_id]


class FakeLedger:
    def __init__(self) -> None:
        self.posted: list[tuple[object, str, str | None]] = []

    def post(self, entry: object, user_id: str, transaction_id: str | None = None) -> None:
        self.posted.append((entry, user_id, transaction_id))

    def balance_of(self, account: Account) -> Money:
        return Money.zero(account.currency)


def _ids():  # type: ignore[no-untyped-def]
    seq = iter(f"id-{i}" for i in range(1, 100))
    return lambda: next(seq)


def test_open_asset_wallet_with_opening_balance() -> None:
    accounts = FakeAccounts()
    ledger = FakeLedger()
    use_case = OpenWallet(accounts, ledger, id_factory=_ids())

    wallet = use_case.execute(
        user_id=USER, name="Banco", account_type=AccountType.ASSET, currency=DOP,
        opening_balance=Money(5_000_000, DOP), opened_on=date(2026, 6, 1),
    )

    assert wallet.type is AccountType.ASSET
    # se creó la wallet + la cuenta equity de apertura
    types = {a.type for a in accounts.list_by_user(USER)}
    assert AccountType.ASSET in types and AccountType.EQUITY in types
    # se posteó un asiento de apertura balanceado
    assert len(ledger.posted) == 1
    entry, user_id, tx_id = ledger.posted[0]
    assert user_id == USER and tx_id is None
    amounts = {p.account_id: p.amount for p in entry.postings}
    assert amounts[wallet.id] == Money(5_000_000, DOP)  # DR wallet


def test_opening_equity_is_reused_across_wallets() -> None:
    accounts = FakeAccounts()
    use_case = OpenWallet(accounts, FakeLedger(), id_factory=_ids())
    use_case.execute(
        user_id=USER, name="Banco", account_type=AccountType.ASSET, currency=DOP,
        opening_balance=Money(5_000_000, DOP), opened_on=date(2026, 6, 1),
    )
    use_case.execute(
        user_id=USER, name="Efectivo", account_type=AccountType.ASSET, currency=DOP,
        opening_balance=Money(500_000, DOP), opened_on=date(2026, 6, 1),
    )
    equities = [a for a in accounts.list_by_user(USER) if a.type is AccountType.EQUITY]
    assert len(equities) == 1  # una sola cuenta de apertura por moneda


def test_open_wallet_without_balance_posts_nothing() -> None:
    accounts = FakeAccounts()
    ledger = FakeLedger()
    OpenWallet(accounts, ledger, id_factory=_ids()).execute(
        user_id=USER, name="Banco", account_type=AccountType.ASSET, currency=DOP,
        opened_on=date(2026, 6, 1),
    )
    assert ledger.posted == []


def test_opening_balance_only_for_asset() -> None:
    use_case = OpenWallet(FakeAccounts(), FakeLedger(), id_factory=_ids())
    with pytest.raises(ValueError):
        use_case.execute(
            user_id=USER, name="Tarjeta", account_type=AccountType.LIABILITY, currency=DOP,
            opening_balance=Money(100_000, DOP), opened_on=date(2026, 6, 1),
        )


def test_open_wallet_rejects_non_wallet_type() -> None:
    use_case = OpenWallet(FakeAccounts(), FakeLedger(), id_factory=_ids())
    with pytest.raises(ValueError):
        use_case.execute(
            user_id=USER, name="X", account_type=AccountType.INCOME, currency=DOP,
            opened_on=date(2026, 6, 1),
        )


def test_create_expense_category_with_icon() -> None:
    accounts = FakeAccounts()
    cat = CreateCategory(accounts, id_factory=_ids()).execute(
        user_id=USER, name="Combustible", kind=AccountType.EXPENSE, currency=DOP, icon="⛽",
    )
    assert cat.type is AccountType.EXPENSE
    assert cat.icon == "⛽"
    assert accounts.get_by_id(cat.id) == cat


def test_create_category_rejects_non_category_type() -> None:
    with pytest.raises(ValueError):
        CreateCategory(FakeAccounts(), id_factory=_ids()).execute(
            user_id=USER, name="X", kind=AccountType.ASSET, currency=DOP,
        )
