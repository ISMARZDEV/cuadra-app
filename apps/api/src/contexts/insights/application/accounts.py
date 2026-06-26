"""Use cases de creación de cuentas: OpenWallet y CreateCategory (write path).

OpenWallet (botón "Add Your Wallets"): crea una wallet (asset/liability) y, si trae saldo
inicial, postea el asiento de apertura vía una cuenta `equity` "Opening Balance" — así el
saldo inicial NO infla los ingresos (insights-ledger.md ①). La equity se reusa: una por
moneda. CreateCategory (modal ⊕): crea una categoría (income/expense) con ícono, que pasa a
ser la cuenta del otro lado de los asientos y un marcador en el arco de la rueda.
"""
from __future__ import annotations

from collections.abc import Callable
from datetime import date

from src.contexts.insights.domain.ledger import (
    Account,
    AccountType,
    JournalEntry,
    Posting,
)
from src.contexts.insights.domain.ports import AccountRepository, LedgerRepository
from src.shared.ids import new_id
from src.shared.money import Money

_WALLET_TYPES = (AccountType.ASSET, AccountType.LIABILITY)
_CATEGORY_TYPES = (AccountType.INCOME, AccountType.EXPENSE)
OPENING_EQUITY_NAME = "Opening Balance"


class OpenWallet:
    def __init__(
        self,
        accounts: AccountRepository,
        ledger: LedgerRepository,
        id_factory: Callable[[], str] = new_id,
    ) -> None:
        self._accounts = accounts
        self._ledger = ledger
        self._id = id_factory

    def execute(
        self,
        *,
        user_id: str,
        name: str,
        account_type: AccountType,
        currency,  # noqa: ANN001  (src.shared.money.Currency)
        opened_on: date,
        opening_balance: Money | None = None,
        icon: str | None = None,
    ) -> Account:
        if account_type not in _WALLET_TYPES:
            raise ValueError(f"Una wallet debe ser asset o liability, no {account_type.value}")
        if opening_balance is not None and account_type is not AccountType.ASSET:
            raise ValueError("El saldo inicial solo se soporta en wallets de tipo asset (MVP)")

        wallet = Account(self._id(), user_id, account_type, currency, name, icon)
        self._accounts.add(wallet)

        if opening_balance is not None and not opening_balance.is_zero():
            equity = self._opening_equity(user_id, opening_balance.currency)
            entry = JournalEntry(
                self._id(),
                opened_on,
                f"Opening · {name}",
                (
                    Posting(wallet.id, opening_balance),     # DR wallet
                    Posting(equity.id, -opening_balance),    # CR equity
                ),
            )
            self._ledger.post(entry, user_id)
        return wallet

    def _opening_equity(self, user_id: str, currency) -> Account:  # noqa: ANN001
        for account in self._accounts.list_by_user(user_id):
            if (
                account.type is AccountType.EQUITY
                and account.currency == currency
                and account.name == OPENING_EQUITY_NAME
            ):
                return account
        equity = Account(self._id(), user_id, AccountType.EQUITY, currency, OPENING_EQUITY_NAME)
        self._accounts.add(equity)
        return equity


class CreateCategory:
    def __init__(
        self,
        accounts: AccountRepository,
        id_factory: Callable[[], str] = new_id,
    ) -> None:
        self._accounts = accounts
        self._id = id_factory

    def execute(
        self,
        *,
        user_id: str,
        name: str,
        kind: AccountType,
        currency,  # noqa: ANN001
        icon: str | None = None,
    ) -> Account:
        if kind not in _CATEGORY_TYPES:
            raise ValueError(f"Una categoría debe ser income o expense, no {kind.value}")
        category = Account(self._id(), user_id, kind, currency, name, icon)
        self._accounts.add(category)
        return category
