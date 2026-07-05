"""`CanonicalProduct` y `StoreProduct` — PUROS (ADR 31). Canonical es POR-MERCADO.

El `CanonicalProduct` es el producto unificado (resultado del matching) y vive en UN mercado
(`market_id`) — no es global: comparar arroz RD vs US mezclaría monedas/realidades. Sabe
comparar sus cotizaciones usando SU propio tamaño. El `StoreProduct` es su presentación en
una tienda concreta, con el precio actual (Money, minor units).
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from src.shared.money import Money

from ..comparison import PriceComparison, StoreQuote
from ..comparison import compare as compare_prices
from ..value_objects import Quantity


@dataclass(frozen=True, slots=True)
class CanonicalProduct:
    id: str
    name: str
    brand: str
    quantity: Quantity
    taxonomy_node_id: str
    market_id: str  # por ID (ADR 33) — un país nuevo = un nuevo valor, sin tocar código
    # Presentación (Imagen #2/#5) — opcionales, no afectan la money-math:
    quality: str | None = None       # Premium|Selecto|…
    display_size: str | None = None  # tamaño ORIGINAL de empaque ("10 LB"), no el normalizado
    image_url: str | None = None
    slug: str | None = None          # llave PÚBLICA URL-safe (SEO); la asigna la infra al persistir

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise ValueError("CanonicalProduct.name no puede estar vacío")
        if not self.market_id.strip():
            raise ValueError("CanonicalProduct.market_id es obligatorio (multi-país)")

    def compare(self, quotes: Iterable[StoreQuote]) -> PriceComparison:
        """Tabla comparativa de este producto entre tiendas, usando SU unidad base."""
        return compare_prices(self.quantity, quotes)


@dataclass(frozen=True, slots=True)
class StoreProduct:
    id: str
    provider_id: str
    canonical_product_id: str
    current_price: Money
    url: str | None = None
    ean: str | None = None  # señal fuerte del matching (nivel 1)

    def __post_init__(self) -> None:
        if self.current_price.amount_minor <= 0:
            raise ValueError("StoreProduct.current_price debe ser > 0")
