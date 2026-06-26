"""Kernel de dinero — `Money` y `Currency` (§12·B, ADR 14).

PRINCIPIO RECTOR (gap #1 de fintech, §12·B): el dinero NUNCA es `float`. Vive en
*minor units* (enteros): RD$5.00 → `500`, como Stripe. La aritmética es cerrada en
enteros y **no mezcla monedas**. Toda cifra de dinero del sistema (ledger, métricas,
presupuesto, FX) pasa por aquí — es la única puerta a la aritmética monetaria.

Lección que esto blinda (Cleo §12): un LLM reportó US$28K de gastos cuando eran ~US$3K.
Aquí los números NO los toca el modelo: son enteros validados en construcción.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

# Exponente (minor digits) por moneda ISO 4217. Default = 2; aquí solo las EXCEPCIONES.
# Estilo Stripe: el factor minor NO es siempre ×100 (yen = ×1, dinar = ×1000).
_MINOR_EXPONENT: dict[str, int] = {
    # 0 decimales (sin minor unit)
    "JPY": 0, "KRW": 0, "CLP": 0, "VND": 0, "ISK": 0, "PYG": 0, "XAF": 0, "XOF": 0,
    "RWF": 0, "UGX": 0, "GNF": 0, "BIF": 0, "DJF": 0, "KMF": 0, "XPF": 0,
    # 3 decimales
    "KWD": 3, "BHD": 3, "OMR": 3, "TND": 3, "JOD": 3, "LYD": 3, "IQD": 3,
}


class CurrencyMismatchError(ValueError):
    """Intentar operar dos `Money` de monedas distintas (no se mezclan · §12·B)."""

    def __init__(self, left: Currency, right: Currency) -> None:
        super().__init__(f"No se pueden mezclar monedas: {left.code} vs {right.code}")
        self.left = left
        self.right = right


@dataclass(frozen=True, slots=True)
class Currency:
    """Moneda ISO 4217 alpha-3 ('DOP', 'USD'). MVP: DOP + USD activas (§2)."""

    code: str

    def __post_init__(self) -> None:
        normalized = self.code.strip().upper()
        if len(normalized) != 3 or not normalized.isalpha():
            raise ValueError(f"Currency inválida (ISO 4217 alpha-3): {self.code!r}")
        object.__setattr__(self, "code", normalized)

    @property
    def exponent(self) -> int:
        """Decimales (minor digits) de la moneda. USD/DOP/COP=2, JPY/CLP=0, KWD=3. Default 2."""
        return _MINOR_EXPONENT.get(self.code, 2)

    def __str__(self) -> str:
        return self.code


@dataclass(frozen=True, slots=True)
class Money:
    """Importe en *minor units* (entero) + moneda. Inmutable. NUNCA `float` (§12·B)."""

    amount_minor: int
    currency: Currency

    def __post_init__(self) -> None:
        # `bool` es subtipo de `int` en Python → excluirlo explícitamente para que
        # `Money(True, ...)` no se cuele como monto.
        if isinstance(self.amount_minor, bool) or not isinstance(self.amount_minor, int):
            raise TypeError(
                "amount_minor debe ser int (minor units), no "
                f"{type(self.amount_minor).__name__}"
            )

    @classmethod
    def zero(cls, currency: Currency) -> Money:
        return cls(0, currency)

    @classmethod
    def from_major(cls, amount: Decimal | int | float | str, currency: Currency) -> Money:
        """Convierte un monto en unidades MAYORES a minor units usando el exponente de la
        moneda (RD$45.50→4550, ¥500→500, KWD 1.234→1234). Entra por `str(amount)` para
        evitar el drift de float (§12·B). Es la ÚNICA puerta de major→minor."""
        scaled = Decimal(str(amount)) * (10 ** currency.exponent)
        return cls(int(scaled.to_integral_value(rounding=ROUND_HALF_UP)), currency)

    def to_major(self) -> Decimal:
        """Minor units → unidades mayores como `Decimal` exacto (para mostrar/formatear)."""
        return Decimal(self.amount_minor) / (10 ** self.currency.exponent)

    def format(self) -> str:
        """Display con el código y los decimales correctos de la moneda ('USD 45.50', 'JPY 500')."""
        return f"{self.currency.code} {self.to_major():,.{self.currency.exponent}f}"

    def _ensure_same_currency(self, other: Money) -> None:
        if self.currency != other.currency:
            raise CurrencyMismatchError(self.currency, other.currency)

    def __add__(self, other: Money) -> Money:
        self._ensure_same_currency(other)
        return Money(self.amount_minor + other.amount_minor, self.currency)

    def __sub__(self, other: Money) -> Money:
        self._ensure_same_currency(other)
        return Money(self.amount_minor - other.amount_minor, self.currency)

    def __neg__(self) -> Money:
        return Money(-self.amount_minor, self.currency)

    def is_zero(self) -> bool:
        return self.amount_minor == 0
