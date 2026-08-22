"""Use case CompareProduct (§6.3): tabla comparativa de un producto entre tiendas.

Núcleo del valor (y futura tool `compare_prices` del Coach). El precio NO lo calcula el use
case: carga el canónico + sus cotizaciones y delega en la money-math del dominio. Si hay
taxonomy_repo, agrega el breadcrumb de categorías (Imagen #5).

Resolución por SLUG (llave pública, SEO) con FALLBACK a UUID (patrón permalink): las páginas
públicas linkean por slug legible; las privadas (lista local, feed de alertas) aún referencian el
producto por su UUID → ambos resuelven la misma página, y el `<link rel=canonical>` (web) apunta
siempre al slug. Así no hay que propagar el slug a cada superficie privada.
"""
from __future__ import annotations

from ..domain.ports import (
    CanonicalImageRepository,
    CanonicalProductRepository,
    StoreProductRepository,
    TaxonomyRepository,
)
from .dtos import PriceComparisonDto
from .errors import CanonicalProductNotFoundError


class CompareProduct:
    def __init__(
        self,
        canonical_repo: CanonicalProductRepository,
        store_repo: StoreProductRepository,
        taxonomy_repo: TaxonomyRepository | None = None,
        image_repo: CanonicalImageRepository | None = None,
    ) -> None:
        self._canonical_repo = canonical_repo
        self._store_repo = store_repo
        self._taxonomy_repo = taxonomy_repo
        # OPCIONAL, igual que el de taxonomía: el detalle es el corazón de Save y no puede caerse
        # porque falte una dependencia decorativa. Sin él, la galería cae a la imagen pública sola.
        self._image_repo = image_repo

    def execute(self, slug: str, market_id: str) -> PriceComparisonDto:
        # slug legible primero; si no matchea, `slug` puede ser un UUID (links privados) → por id.
        canonical = self._canonical_repo.get_by_slug(slug, market_id) or (
            self._canonical_repo.get_by_id(slug)
        )
        if canonical is None:
            raise CanonicalProductNotFoundError(slug)
        quotes = self._store_repo.list_quotes_by_canonical(canonical.id)
        comparison = canonical.compare(quotes)  # domain service (money-math)
        breadcrumb = []
        if self._taxonomy_repo is not None and canonical.taxonomy_node_id:
            breadcrumb = self._taxonomy_repo.ancestors(canonical.taxonomy_node_id)
        gallery = None
        if self._image_repo is not None:
            # ORDENADO acá y no confiando en el almacén: quien pide la galería no puede depender de
            # cómo se la devuelva una consulta, o el carrusel abriría en la 3ra foto en cuanto
            # alguien toque un `ORDER BY`.
            images = sorted(
                self._image_repo.list_images(canonical.id), key=lambda i: i.position
            )
            gallery = [i.url for i in images]
        return PriceComparisonDto.from_comparison(canonical, comparison, breadcrumb, gallery)
