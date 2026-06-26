"""`RecurringRule` — recurrentes/suscripciones + bill reminders (gap aprobado), PURO.

Plantilla que se repite (renta, Spotify). Sabe si está VENCIDA (`is_due`), cómo AVANZAR su
próxima fecha (con clamp de fin de mes / 29-feb) y MATERIALIZAR una `Transaction` para una
ocurrencia (que luego genera su asiento en el ledger). Ver insights-ledger.md §6.
"""
from __future__ import annotations

import calendar
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta
from enum import StrEnum

from src.shared.money import Money

from .transaction import Merchant, Transaction, TransactionSource, TransactionType


class Cadence(StrEnum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"


def _add_months(d: date, n: int) -> date:
    index = d.month - 1 + n
    year = d.year + index // 12
    month = index % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])  # clamp fin de mes
    return date(year, month, day)


def _next_date(d: date, cadence: Cadence) -> date:
    if cadence is Cadence.DAILY:
        return d + timedelta(days=1)
    if cadence is Cadence.WEEKLY:
        return d + timedelta(weeks=1)
    if cadence is Cadence.MONTHLY:
        return _add_months(d, 1)
    return _add_months(d, 12)  # YEARLY


@dataclass(frozen=True, slots=True)
class RecurringRule:
    id: str
    user_id: str
    type: TransactionType
    amount: Money
    account_id: str
    counter_account_id: str
    cadence: Cadence
    next_run: date
    active: bool = True
    merchant: Merchant | None = None
    note: str | None = None

    def __post_init__(self) -> None:
        if self.amount.amount_minor <= 0:
            raise ValueError(f"El monto de la regla debe ser > 0, fue {self.amount.amount_minor}")

    def is_due(self, as_of: date) -> bool:
        return self.active and as_of >= self.next_run

    def advance(self) -> RecurringRule:
        return replace(self, next_run=_next_date(self.next_run, self.cadence))

    def materialize(self, tx_id: str, occurred_at: datetime) -> Transaction:
        return Transaction(
            id=tx_id,
            user_id=self.user_id,
            type=self.type,
            amount=self.amount,
            account_id=self.account_id,
            counter_account_id=self.counter_account_id,
            occurred_at=occurred_at,
            source=TransactionSource.MANUAL,
            merchant=self.merchant,
            note=self.note,
            recurring=True,
        )
