"""DTOs de Save (Pydantic) — contrato que sale por la API. Montos en minor units (§12·B)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from ..domain.comparison import PriceComparison
from ..domain.drops import PriceDrop
from ..domain.entities import CanonicalProduct
from ..domain.history import PricePoint
from ..domain.taxonomy import CategoryNode


class ProductSearchDto(BaseModel):
    id: str
    name: str
    brand: str

    @classmethod
    def from_entity(cls, product: CanonicalProduct) -> ProductSearchDto:
        return cls(id=product.id, name=product.name, brand=product.brand)


class CategoryRefDto(BaseModel):
    """Referencia a una categoría (para breadcrumb, subcategorías y árbol)."""

    name: str
    slug: str


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
    brand: str
    quality: str | None = None
    display_size: str | None = None   # tamaño original ("10 LB") para el badge
    image_url: str | None = None
    currency: str
    entries: list[ComparedPriceDto]
    cheapest_provider: str
    spread_minor: int
    breadcrumb: list["CategoryRefDto"] = []  # ruta de categorías (Imagen #5)

    @classmethod
    def from_comparison(
        cls,
        canonical: CanonicalProduct,
        comparison: PriceComparison,
        breadcrumb: list[CategoryNode] = [],
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
            brand=canonical.brand,
            quality=canonical.quality,
            display_size=canonical.display_size,
            image_url=canonical.image_url,
            currency=comparison.cheapest.price.currency.code,
            entries=entries,
            cheapest_provider=comparison.cheapest.provider_name,
            spread_minor=comparison.spread.amount_minor,
            breadcrumb=[CategoryRefDto(name=n.name, slug=n.slug) for n in breadcrumb],
        )


class PriceDropDto(BaseModel):
    """Una bajada de precio detectada (feed de ofertas / futuras alertas)."""

    canonical_product_id: str
    product_name: str
    provider_id: str
    provider_name: str
    previous_minor: int
    current_minor: int
    currency: str
    drop_minor: int
    drop_bps: int  # básis points (526 = -5.26%)
    captured_at: datetime
    price_type: str

    @classmethod
    def from_drop(cls, drop: PriceDrop) -> PriceDropDto:
        change = drop.change
        return cls(
            canonical_product_id=change.canonical_product_id,
            product_name=change.product_name,
            provider_id=change.provider_id,
            provider_name=change.provider_name,
            previous_minor=change.previous.amount_minor,
            current_minor=change.current.amount_minor,
            currency=change.current.currency.code,
            drop_minor=drop.drop.amount_minor,
            drop_bps=drop.drop_bps,
            captured_at=change.captured_at,
            price_type=change.price_type.value,
        )


class PricePointDto(BaseModel):
    """Un punto de cambio del chart (change-only: el precio rige hasta el punto siguiente)."""

    price_minor: int
    captured_at: datetime
    price_type: str  # online|delivery|shelf|receipt — nunca se mezclan (doc 01)


class ProviderSeriesDto(BaseModel):
    provider_id: str
    provider_name: str
    points: list[PricePointDto]


class PriceHistoryDto(BaseModel):
    canonical_product_id: str
    name: str
    currency: str
    range: str
    series: list[ProviderSeriesDto]

    @classmethod
    def from_series(
        cls,
        canonical: CanonicalProduct,
        range_: str,
        series: dict[str, list[PricePoint]],
        fallback_currency: str,
    ) -> PriceHistoryDto:
        currencies = {p.price.currency.code for pts in series.values() for p in pts}
        if len(currencies) > 1:  # regla sagrada: jamás mezclar monedas en un mismo chart
            raise ValueError(f"Histórico con monedas mezcladas: {sorted(currencies)}")
        return cls(
            canonical_product_id=canonical.id,
            name=canonical.name,
            currency=next(iter(currencies), fallback_currency),
            range=range_,
            series=[
                ProviderSeriesDto(
                    provider_id=pid,
                    provider_name=pts[0].provider_name,
                    points=[
                        PricePointDto(
                            price_minor=p.price.amount_minor,
                            captured_at=p.captured_at,
                            price_type=p.price_type.value,
                        )
                        for p in pts
                    ],
                )
                for pid, pts in series.items()
                if pts
            ],
        )


class CategoryNodeDto(CategoryRefDto):
    """Nodo del árbol de categorías con sus hijos anidados."""

    children: list["CategoryNodeDto"] = []

    @classmethod
    def from_node(cls, node: CategoryNode) -> "CategoryNodeDto":
        return cls(
            name=node.name,
            slug=node.slug,
            children=[cls.from_node(c) for c in node.children],
        )


class CategoryTreeDto(BaseModel):
    categories: list[CategoryNodeDto]


class ProviderRefDto(BaseModel):
    """Referencia a un supermercado (A9: "Ofertas por supermercado")."""

    id: str
    name: str


class AlertDto(BaseModel):
    """Suscripción de alerta (G4) como la ve el usuario."""

    id: str
    canonical_product_id: str
    product_name: str
    threshold_minor: int | None = None
    created_at: datetime


class AlertNotificationDto(BaseModel):
    """Alerta disparada (feed in-app): la bajada que gatilló la notificación."""

    id: str
    canonical_product_id: str
    product_name: str
    provider_name: str
    previous_minor: int
    current_minor: int
    currency: str
    drop_bps: int
    triggered_at: datetime
    read: bool


class CategoryPageDto(BaseModel):
    """Página de una categoría: breadcrumb + subcategorías + productos (Imagen #8)."""

    name: str
    slug: str
    breadcrumb: list[CategoryRefDto]
    subcategories: list[CategoryRefDto]
    products: list[ProductSearchDto]


class ProductCardDto(BaseModel):
    """Card de producto en el listado (Imagen #5): precio mínimo, precio/unidad, N tiendas."""

    id: str
    name: str
    brand: str
    quality: str | None = None
    display_size: str | None = None  # tamaño original ("10 LB") para el badge
    image_url: str | None = None
    price_minor: int          # el MÁS BARATO entre tiendas
    currency: str
    unit_price_minor: int     # precio por unidad base (§B2)
    unit_measure: str         # mass|volume|count
    store_count: int          # "N tiendas" (B4)
    discount_bps: int | None = None  # % de bajada reciente (badge −X%), None si no está en oferta


class FacetValueDto(BaseModel):
    """Un valor de faceta con su conteo (supermercado o marca)."""

    id: str
    name: str
    count: int


class PriceBucketDto(BaseModel):
    """Un rango de precio preset con su conteo ("Hasta RD$125" · 129)."""

    min_minor: int
    max_minor: int | None  # None = "y más" (sin tope)
    count: int


class PriceFacetDto(BaseModel):
    min_minor: int
    max_minor: int
    currency: str
    histogram: list[int] = []         # conteos por bin (barras del filtro de precio)
    buckets: list[PriceBucketDto] = []  # rangos preset clicables con conteo


class CategoryFacetsDto(BaseModel):
    price: PriceFacetDto
    stores: list[FacetValueDto]
    brands: list[FacetValueDto]


class ProviderPageDto(BaseModel):
    """Página propia de un supermercado (A9): nombre + su catálogo."""

    name: str
    products: list[ProductCardDto]


class CategoryListingDto(BaseModel):
    """Listado filtrable/ordenable por categoría (Imagen #5): cards + facetas + paginación.

    `popular`: top productos por popularidad de TODA la rama (sin filtros aplicar) — alimenta la
    plantilla Overview cuando el nodo tiene subcategorías (el frontend decide qué plantilla usar
    según `subcategories`; `products`/`facets`/`total` siguen siendo el listado filtrado para la
    plantilla Listing de los nodos hoja).
    """

    name: str
    slug: str
    breadcrumb: list[CategoryRefDto]
    subcategories: list[CategoryRefDto]
    total: int                # productos que pasan los filtros (antes de paginar)
    products: list[ProductCardDto]
    facets: CategoryFacetsDto
    popular: list[ProductCardDto] = []
