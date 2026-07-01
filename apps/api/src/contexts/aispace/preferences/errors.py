"""Errores de negocio de las preferencias de moneda — el mensaje al usuario NO vive aquí (i18n,
como `FinanceToolError`); estos son `code`s que el controller mapea a 422 con el detalle."""
from __future__ import annotations


class TooManyCurrenciesError(ValueError):
    """Más de las 3 monedas adicionales permitidas (§currency-preferences)."""

    def __init__(self, count: int) -> None:
        self.count = count
        super().__init__(f"máximo 3 monedas adicionales, se dieron {count}")


class UnsupportedCurrencyError(ValueError):
    """Una moneda fuera de `ACTIVE_CURRENCIES` (§currency-preferences)."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(f"moneda no activa: {code!r}")
