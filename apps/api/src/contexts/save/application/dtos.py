"""DTOs de Save (Pydantic) — contrato que sale por la API. Montos en minor units (§12·B)."""
from __future__ import annotations

from pydantic import BaseModel

from ..domain.comparison import PriceComparison
from ..domain.entities import CanonicalProduct


class ProductSearchDto(BaseModel):
    id: str
    name: str
    brand: str

    @classmethod
    def from_entity(cls, product: CanonicalProduct) -> ProductSearchDto:
        return cls(id=product.id, name=product.name, brand=product.brand)


class ComparedPriceDto(BaseModel):
    """Una fila de la tabla comparativa (una tienda)."""

    provider_id: str
    provider_name: str
    price_minor: int
    currency: str
    unit_price_minor: int          # precio por unidad base
    unit_measure: str              # mass|volume|count
    is_cheapest: bool              # "Mejor precio"
    extra_minor: int               # sobreprecio vs la más barata ("+RD$14")
    url: str | None = None


class PriceComparisonDto(BaseModel):
    canonical_product_id: str
    name: str
    currency: str
    entries: list[ComparedPriceDto]
    cheapest_provider: str
    spread_minor: int

    @classmethod
    def from_comparison(
        cls, canonical: CanonicalProduct, comparison: PriceComparison
    ) -> PriceComparisonDto:
        entries = [
            ComparedPriceDto(
                provider_id=e.provider_id,
                provider_name=e.provider_name,
                price_minor=e.price.amount_minor,
                currency=e.price.currency.code,
                unit_price_minor=e.unit_price.amount_minor,
                unit_measure=e.unit_price.measure.value,
                is_cheapest=e.is_cheapest,
                extra_minor=e.extra_vs_cheapest.amount_minor,
                url=e.url,
            )
            for e in comparison.entries
        ]
        return cls(
            canonical_product_id=canonical.id,
            name=canonical.name,
            currency=comparison.cheapest.price.currency.code,
            entries=entries,
            cheapest_provider=comparison.cheapest.provider_name,
            spread_minor=comparison.spread.amount_minor,
        )
