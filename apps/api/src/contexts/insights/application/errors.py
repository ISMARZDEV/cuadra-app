"""Errores de la capa de aplicación de Insights (se mapean a ProblemDetails en la API)."""
from __future__ import annotations


class InsightsError(Exception):
    """Base de los errores de aplicación de Insights."""


class AccountNotFoundError(InsightsError):
    """Una cuenta referida por la transacción no existe."""


class CrossUserAccountError(InsightsError):
    """Una cuenta de la transacción pertenece a OTRO usuario (RBAC §12.1)."""


class TransactionCurrencyError(InsightsError):
    """El monto y las cuentas no comparten moneda (MVP single-currency; FX diferido §12·B)."""
