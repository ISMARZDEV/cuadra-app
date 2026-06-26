"""Tipos contables de cuenta del ledger (§12·B, ADR 14).

Cada `Account` tiene un tipo con un "lado normal": asset/expense suben con débito (+),
liability/income/equity suben con crédito (−). El net worth = Σ asset + Σ liability(signo).
"""
from __future__ import annotations

from enum import StrEnum


class AccountType(StrEnum):
    ASSET = "asset"          # activos: wallets (efectivo, débito), ahorros
    LIABILITY = "liability"  # pasivos: tarjeta de crédito
    INCOME = "income"        # ingresos (= categorías de ingreso)
    EXPENSE = "expense"      # gastos (= categorías de gasto)
    EQUITY = "equity"        # patrimonio: Opening Balance (saldo de apertura)
