"""Domain service `compare()` de Save (§6.3), PURO (ADR 31): tabla comparativa de precios.

Dado el tamaño del producto canónico y sus cotizaciones por tienda (mismo `price_type`,
filtrado en la capa de aplicación), ordena por precio, marca la más barata y calcula el
sobreprecio de cada otra + su precio por unidad base. Money-math en enteros (§12·B).
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from src.shared.money import Money

from .value_objects import Quantity, UnitPrice, unit_price


@dataclass(frozen=True, slots=True)
class StoreQuote:
    """Cotización de una tienda para el producto canónico (precio ya del mismo `price_type`)."""

    provider_id: str
    provider_name: str
    price: Money
    url: str | None = None


@dataclass(frozen=True, slots=True)
class ComparedPrice:
    """Una fila de la tabla comparativa."""

    provider_id: str
    provider_name: str
    price: Money
    unit_price: UnitPrice
    is_cheapest: bool
    extra_vs_cheapest: Money  # 0 en la más barata; "+RD$14 más caro" en las demás
    url: str | None = None


@dataclass(frozen=True, slots=True)
class PriceComparison:
    """Resultado de comparar un producto entre tiendas: filas ordenadas asc. por precio."""

    quantity: Quantity
    entries: tuple[ComparedPrice, ...]

    @property
    def cheapest(self) -> ComparedPrice:
        return self.entries[0]

    @property
    def most_expensive(self) -> ComparedPrice:
        return self.entries[-1]

    @property
    def spread(self) -> Money:
        return self.most_expensive.price - self.cheapest.price


def compare(quantity: Quantity, quotes: Iterable[StoreQuote]) -> PriceComparison:
    """Ordena las cotizaciones y arma la tabla comparativa. Requiere ≥1 y una sola moneda."""
    items = list(quotes)
    if not items:
        raise ValueError("compare() requiere al menos una cotización")
    if len({q.price.currency for q in items}) > 1:
        raise ValueError("No se pueden comparar precios de distinta moneda")

    ordered = sorted(items, key=lambda q: q.price.amount_minor)
    cheapest_price = ordered[0].price
    entries = tuple(
        ComparedPrice(
            provider_id=q.provider_id,
            provider_name=q.provider_name,
            price=q.price,
            unit_price=unit_price(q.price, quantity),
            is_cheapest=(i == 0),
            extra_vs_cheapest=q.price - cheapest_price,
            url=q.url,
        )
        for i, q in enumerate(ordered)
    )
    return PriceComparison(quantity, entries)
