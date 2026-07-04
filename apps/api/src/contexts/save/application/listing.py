"""Use case ListCategoryProducts (§A4/A5): listado por categoría con facetas, filtros y orden.

Corazón de la Imagen #5. El repo entrega filas producto×tienda (grain crudo); el use case las
agrega en memoria: precio mínimo, conteo de tiendas, precio/unidad (money-math del dominio) y las
facetas (precio · supermercados · marcas). Las FACETAS se calculan sobre el set completo de la
categoría (los conteos no dependen de los filtros activos — MVP simple y honesto). Solo lectura.
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from ..domain.listing import OfferingRow  # re-exportado para el port y los tests
from ..domain.ports import StoreProductRepository, TaxonomyRepository
from ..domain.value_objects import Quantity, unit_price
from src.shared.money import Money
from .categories import _find_path
from .dtos import (
    CategoryFacetsDto,
    CategoryListingDto,
    CategoryRefDto,
    FacetValueDto,
    PriceFacetDto,
    ProductCardDto,
)
from .errors import CategoryNotFoundError

__all__ = ["ListCategoryProducts", "OfferingRow"]

_SORTS = {"price", "unit_price", "name"}


@dataclass
class _Aggregated:
    """Un producto ya agregado desde sus filas producto×tienda."""

    product_id: str
    name: str
    brand: str
    quality: str | None
    display_size: str | None
    image_url: str | None
    quantity: Quantity
    min_price: Money
    providers: dict[str, str]  # provider_id → provider_name (tiendas que lo tienen)

    @property
    def unit_price_minor(self) -> int:
        return unit_price(self.min_price, self.quantity).amount_minor


def _aggregate(rows: Iterable[OfferingRow]) -> dict[str, _Aggregated]:
    out: dict[str, _Aggregated] = {}
    for r in rows:
        agg = out.get(r.product_id)
        if agg is None:
            out[r.product_id] = _Aggregated(
                r.product_id, r.name, r.brand, r.quality, r.display_size, r.image_url,
                r.quantity, r.price, {r.provider_id: r.provider_name},
            )
            continue
        agg.providers[r.provider_id] = r.provider_name
        if r.price.amount_minor < agg.min_price.amount_minor:
            agg.min_price = r.price
    return out


def _build_facets(products: Iterable[_Aggregated]) -> CategoryFacetsDto:
    items = list(products)
    prices = [p.min_price.amount_minor for p in items]
    currency = items[0].min_price.currency.code if items else "DOP"

    store_count: dict[str, int] = {}
    store_name: dict[str, str] = {}
    brand_count: dict[str, int] = {}
    for p in items:
        for pid, pname in p.providers.items():
            store_count[pid] = store_count.get(pid, 0) + 1
            store_name.setdefault(pid, pname)
        if p.brand:
            brand_count[p.brand] = brand_count.get(p.brand, 0) + 1

    stores = [
        FacetValueDto(id=pid, name=store_name[pid], count=c)
        for pid, c in sorted(store_count.items(), key=lambda kv: (-kv[1], store_name[kv[0]]))
    ]
    brands = [
        FacetValueDto(id=name, name=name, count=c)
        for name, c in sorted(brand_count.items(), key=lambda kv: (-kv[1], kv[0]))
    ]
    return CategoryFacetsDto(
        price=PriceFacetDto(
            min_minor=min(prices) if prices else 0,
            max_minor=max(prices) if prices else 0,
            currency=currency,
        ),
        stores=stores,
        brands=brands,
    )


def _passes(
    p: _Aggregated,
    stores: tuple[str, ...],
    brands: tuple[str, ...],
    price_min: int | None,
    price_max: int | None,
) -> bool:
    if stores and not (set(stores) & p.providers.keys()):
        return False
    if brands and p.brand not in brands:
        return False
    if price_min is not None and p.min_price.amount_minor < price_min:
        return False
    if price_max is not None and p.min_price.amount_minor > price_max:
        return False
    return True


def _sort_key(sort: str):
    if sort == "unit_price":
        return lambda p: (p.unit_price_minor, p.name)
    if sort == "name":
        return lambda p: p.name
    return lambda p: (p.min_price.amount_minor, p.name)  # "price" (default)


def _to_card(p: _Aggregated) -> ProductCardDto:
    return ProductCardDto(
        id=p.product_id,
        name=p.name,
        brand=p.brand,
        quality=p.quality,
        display_size=p.display_size,
        image_url=p.image_url,
        price_minor=p.min_price.amount_minor,
        currency=p.min_price.currency.code,
        unit_price_minor=p.unit_price_minor,
        unit_measure=p.quantity.measure.value,
        store_count=len(p.providers),
    )


class ListCategoryProducts:
    def __init__(
        self, taxonomy_repo: TaxonomyRepository, store_repo: StoreProductRepository
    ) -> None:
        self._tax = taxonomy_repo
        self._store = store_repo

    def execute(
        self,
        market_id: str,
        slug: str,
        *,
        stores: tuple[str, ...] = (),
        brands: tuple[str, ...] = (),
        price_min: int | None = None,
        price_max: int | None = None,
        sort: str = "price",
        limit: int = 48,
        offset: int = 0,
    ) -> CategoryListingDto:
        path = _find_path(self._tax.list_tree(market_id), slug)
        if path is None:
            raise CategoryNotFoundError(slug)
        node = path[-1]

        rows = self._store.list_category_offerings(self._tax.descendant_ids(node.id))
        products = _aggregate(rows)
        facets = _build_facets(products.values())

        filtered = [
            p for p in products.values() if _passes(p, stores, brands, price_min, price_max)
        ]
        sort = sort if sort in _SORTS else "price"
        ordered = sorted(filtered, key=_sort_key(sort))
        page = ordered[offset : offset + limit]

        return CategoryListingDto(
            name=node.name,
            slug=node.slug,
            breadcrumb=[CategoryRefDto(name=n.name, slug=n.slug) for n in path],
            subcategories=[CategoryRefDto(name=c.name, slug=c.slug) for c in node.children],
            total=len(ordered),
            products=[_to_card(p) for p in page],
            facets=facets,
        )
