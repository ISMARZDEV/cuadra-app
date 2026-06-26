"""`Transaction` — el movimiento que crea el usuario (§5.2), PURO (ADR 31).

Su trabajo de dominio es traducirse a un `JournalEntry` de doble entrada (`to_journal_entry`):
es el puente entre la UI y el ledger (§12·B). El monto es una MAGNITUD (>0); el signo lo
decide el tipo. `account_id` = wallet primaria; `counter_account_id` = la categoría
(income/expense) o la wallet destino (transfer). Campos de enrichment (§5.6) opcionales.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from src.shared.money import Money

from ..ledger import JournalEntry, Posting


class TransactionType(StrEnum):
    INCOME = "income"
    EXPENSE = "expense"
    TRANSFER = "transfer"


class TransactionSource(StrEnum):
    """Cómo se capturó el movimiento (§5.4). Correo bancario = fase 1."""

    MANUAL = "manual"
    VOICE = "voice"
    OCR = "ocr"


@dataclass(frozen=True, slots=True)
class Merchant:
    """Comercio normalizado (§5.6) — nombre + logo para las filas de Recent Transactions."""

    name: str
    logo_url: str | None = None


@dataclass(frozen=True, slots=True)
class Transaction:
    id: str
    user_id: str
    type: TransactionType
    amount: Money               # magnitud (>0); el signo lo da el tipo
    account_id: str             # wallet primaria
    counter_account_id: str     # categoría (income/expense) o wallet destino (transfer)
    occurred_at: datetime
    source: TransactionSource = TransactionSource.MANUAL
    idempotency_key: str | None = None
    merchant: Merchant | None = None
    note: str | None = None
    # enrichment (§5.6) — se completa después de la captura
    essential: bool | None = None
    recurring: bool | None = None

    def __post_init__(self) -> None:
        if self.amount.amount_minor <= 0:
            raise ValueError(
                f"El monto de una transacción debe ser > 0, fue {self.amount.amount_minor}"
            )
        if self.type is TransactionType.TRANSFER and self.account_id == self.counter_account_id:
            raise ValueError("Una transferencia no puede ser a la misma cuenta")

    def to_journal_entry(self) -> JournalEntry:
        """Traduce la transacción a su asiento balanceado (DR +, CR −)."""
        amount = self.amount
        if self.type is TransactionType.INCOME:
            # el dinero ENTRA a la wallet
            postings = (
                Posting(self.account_id, amount),
                Posting(self.counter_account_id, -amount),
            )
        else:
            # EXPENSE / TRANSFER: el dinero SALE de la wallet
            postings = (
                Posting(self.counter_account_id, amount),
                Posting(self.account_id, -amount),
            )
        description = self.note or (self.merchant.name if self.merchant else self.type.value)
        return JournalEntry(self.id, self.occurred_at.date(), description, postings)
