"""Detección de bajadas de precio (G4) — dominio PURO (ADR 31).

La infra entrega `PriceChange`: el par consecutivo previous→current de un store_product
(SQL LAG sobre la tabla `price` change-only). El dominio clasifica: bajada = current <
previous EN LA MISMA moneda (un par con monedas distintas no es comparable — jamás se
inventa una conversión). Magnitud en enteros: `drop` (Money) y `drop_bps` (básis points,
división entera §12·B). Base del feed de ofertas (A7) y de las alertas por usuario (F2).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from src.shared.money import Money

from .entities import PriceType


@dataclass(frozen=True, slots=True)
class PriceChange:
    """Par consecutivo de precios de un store_product (lo arma la infra)."""

    canonical_product_id: str
    product_name: str
    provider_id: str
    provider_name: str
    previous: Money
    current: Money
    captured_at: datetime  # cuándo rige el precio nuevo
    price_type: PriceType


@dataclass(frozen=True, slots=True)
class PriceDrop:
    change: PriceChange
    drop: Money      # previous - current
    drop_bps: int    # básis points: drop*10000 // previous


def detect_drops(changes: list[PriceChange]) -> list[PriceDrop]:
    """Filtra bajadas y las ordena por magnitud relativa (mayor % primero)."""
    drops: list[PriceDrop] = []
    for change in changes:
        if change.current.currency != change.previous.currency:
            continue  # no comparable
        prev_minor = change.previous.amount_minor
        curr_minor = change.current.amount_minor
        if curr_minor >= prev_minor:
            continue  # subida o sin cambio
        drop_minor = prev_minor - curr_minor
        drops.append(
            PriceDrop(
                change=change,
                drop=Money(drop_minor, change.previous.currency),
                drop_bps=drop_minor * 10000 // prev_minor,
            )
        )
    return sorted(drops, key=lambda d: d.drop_bps, reverse=True)
