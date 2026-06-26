"""`Account` — cuenta del ledger (entidad PURA, sin SQLAlchemy · ADR 31).

Una wallet es un `Account` tipo `asset`; una tarjeta de crédito, `liability`; una
categoría de gasto/ingreso, `expense`/`income`; el saldo de apertura, `equity`.
El saldo NO vive aquí: es derivado (`Ledger.balance_of`).
"""
from __future__ import annotations

from dataclasses import dataclass

from src.shared.money import Currency

from .enums import AccountType


@dataclass(frozen=True, slots=True)
class Account:
    id: str
    user_id: str
    type: AccountType
    currency: Currency
    name: str
    icon: str | None = None  # emoji/ícono (categorías en el arco de la rueda; visual de wallets)
