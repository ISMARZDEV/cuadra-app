"""`Ledger` — agregado que acumula asientos y DERIVA saldos (§12·B, ADR 14).

`balance_of(account)` = Σ de los postings que apuntan a esa cuenta, en su moneda.
Si un posting llega en otra moneda que la de la cuenta, `Money.+` lanza
`CurrencyMismatchError` → el ledger no mezcla monedas ni siquiera por error.
El saldo NUNCA se almacena mutable: siempre se recalcula desde los asientos.
"""
from __future__ import annotations

from src.shared.money import Money

from .account import Account
from .journal import JournalEntry


class Ledger:
    def __init__(self) -> None:
        self._entries: list[JournalEntry] = []

    def post(self, entry: JournalEntry) -> None:
        self._entries.append(entry)

    @property
    def entries(self) -> tuple[JournalEntry, ...]:
        return tuple(self._entries)

    def balance_of(self, account: Account) -> Money:
        total = Money.zero(account.currency)
        for entry in self._entries:
            for posting in entry.postings:
                if posting.account_id == account.id:
                    total = total + posting.amount  # CurrencyMismatch si no calza
        return total
