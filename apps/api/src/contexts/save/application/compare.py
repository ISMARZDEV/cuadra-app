"""Use case CompareProduct (§6.3): tabla comparativa de un producto entre tiendas.

Núcleo del valor (y futura tool `compare_prices` del Coach). El precio NO lo calcula el use
case: carga el canónico + sus cotizaciones y delega en la money-math del dominio.
"""
from __future__ import annotations

from ..domain.ports import CanonicalProductRepository, StoreProductRepository
from .dtos import PriceComparisonDto
from .errors import CanonicalProductNotFoundError


class CompareProduct:
    def __init__(
        self,
        canonical_repo: CanonicalProductRepository,
        store_repo: StoreProductRepository,
    ) -> None:
        self._canonical_repo = canonical_repo
        self._store_repo = store_repo

    def execute(self, canonical_product_id: str) -> PriceComparisonDto:
        canonical = self._canonical_repo.get_by_id(canonical_product_id)
        if canonical is None:
            raise CanonicalProductNotFoundError(canonical_product_id)
        quotes = self._store_repo.list_quotes_by_canonical(canonical_product_id)
        comparison = canonical.compare(quotes)  # domain service (money-math)
        return PriceComparisonDto.from_comparison(canonical, comparison)
