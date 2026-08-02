"""Value-objects de unidad y precio por unidad base de Save (§6.2), PURO (ADR 31).

La comparación JUSTA entre productos de distinto tamaño exige un **precio por unidad base**
(RD$/kg, RD$/L, RD$/und). `Quantity` va SIEMPRE normalizada a la unidad base de su medida;
el parseo de "5lb"→kg es otra pieza (parser de tamaños). `unit_price` calcula en ENTEROS
(minor units), redondeo half-up — el dinero NUNCA es float (§12·B, regla sagrada).
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum

from src.shared.money import Currency, Money


class UnitMeasure(StrEnum):
    """Magnitud del producto y su unidad base para comparar."""

    MASS = "mass"      # unidad base: kilogramo (kg)
    VOLUME = "volume"  # unidad base: litro (L)
    COUNT = "count"    # unidad base: unidad (und)


@dataclass(frozen=True, slots=True)
class Quantity:
    """Cantidad de producto, YA normalizada a la unidad base de su medida (kg/L/und)."""

    amount: Decimal
    measure: UnitMeasure

    def __post_init__(self) -> None:
        if self.amount <= 0:
            raise ValueError(f"La cantidad debe ser > 0, fue {self.amount}")


@dataclass(frozen=True, slots=True)
class UnitPrice:
    """Precio por unidad base (minor units por kg/L/und) — la clave de comparación justa."""

    amount_minor: int
    currency: Currency
    measure: UnitMeasure


def unit_price_or_none(price: Money, quantity: Quantity | None) -> UnitPrice | None:
    """Precio por unidad base, o `None` si el producto NO declara cantidad.

    `None` y jamás 0: un precio unitario de cero se ordenaría PRIMERO en «más barato por kilo» y
    pondría un plato para perro por encima de la comida. Sin cantidad no hay nada que dividir, y el
    dato honesto es la ausencia — no un número inventado que después nadie sabe de dónde salió.
    """
    return None if quantity is None else unit_price(price, quantity)


def unit_price(price: Money, quantity: Quantity) -> UnitPrice:
    """price / cantidad_base → precio por unidad base, en minor units (half-up).

    El número se deriva en enteros: NUNCA lo produce un float ni un modelo.
    """
    minor = (Decimal(price.amount_minor) / quantity.amount).to_integral_value(
        rounding=ROUND_HALF_UP
    )
    return UnitPrice(int(minor), price.currency, quantity.measure)
