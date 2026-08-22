"""Panel PÚBLICO de «otras tiendas» del detalle de producto.

Gemelo público de «Proveedores matcheados» del admin. Lee LA MISMA consulta (`list_providers`) a
propósito: dos consultas para el mismo panel acaban dando números distintos, que es el defecto que
el propio admin ya documentó (el tile decía RD$76.00, la fila RD$75.00 y la diferencia RD$1.00).
Lo que este use case decide es QUÉ se publica y qué se queda en el back-office.
"""

from __future__ import annotations

from ..domain.ports.repositories import CanonicalProductRepository, CanonicalProviderReader
from .dtos import StorePriceDto
from .errors import CanonicalProductNotFoundError


class ListProductStores:
    def __init__(
        self, canonical_repo: CanonicalProductRepository, catalog_repo: CanonicalProviderReader
    ) -> None:
        self._canonical = canonical_repo
        self._catalog = catalog_repo

    def execute(self, slug: str, market_id: str) -> list[StorePriceDto]:
        # Permalink: slug legible primero; si no matchea puede ser un UUID (links privados).
        canonical = self._canonical.get_by_slug(slug, market_id) or self._canonical.get_by_id(slug)
        if canonical is None:
            # `[]` haría indistinguible «no tiene tiendas» de «ese producto no existe».
            raise CanonicalProductNotFoundError(slug)

        rows = self._catalog.list_providers(canonical.id)
        if not rows:
            return []

        # El sobreprecio se calcula ACÁ, contra el mínimo real de la lista, para que la fila y el
        # tile de «Diferencia» no puedan discrepar. `is_cheapest` viene del repo, pero el mínimo se
        # recalcula: si un día llegaran dos tiendas empatadas al mínimo, las dos deben dar 0.
        cheapest = min(r.price_minor for r in rows)
        return [
            StorePriceDto(
                provider_id=r.provider_id,
                provider_name=r.provider_name,
                provider_logo_url=r.provider_logo_url,
                price_minor=r.price_minor,
                currency=r.currency,
                previous_price_minor=r.previous_price_minor,
                extra_minor=r.price_minor - cheapest,
                is_cheapest=r.is_cheapest,
                price_type=r.price_type,
                last_seen_at=r.last_seen_at,
                url=r.url,
            )
            for r in rows
        ]
