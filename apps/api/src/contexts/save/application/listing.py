"""Use case ListCategoryProducts (§A4/A5): listado por categoría con facetas, filtros y orden.

Corazón de la Imagen #5. El repo entrega filas producto×tienda (grain crudo); el use case las
agrega en memoria: precio mínimo, conteo de tiendas, precio/unidad (money-math del dominio) y las
facetas (precio · supermercados · marcas). Las FACETAS se calculan sobre el set completo de la
categoría (los conteos no dependen de los filtros activos — MVP simple y honesto). Solo lectura.
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from ..domain.drops import detect_drops
from ..domain.image_variant import sized_image_url
from ..domain.listing import OfferingRow  # re-exportado para el port y los tests
from ..domain.ports import (
    CanonicalProductRepository,
    StoreProductRepository,
    TaxonomyRepository,
)
from ..domain.value_objects import Quantity, unit_price_or_none
from ..domain.value_objects.display_units import DisplayUnitPrice, display_unit_price_or_none
from src.shared.money import Money
from .categories import _find_path
from .dtos import (
    CategoryFacetsDto,
    CategoryListingDto,
    CategoryRefDto,
    FacetValueDto,
    PriceBucketDto,
    PriceFacetDto,
    ProductCardPageDto,
    ProductCardDto,
)
from .errors import CategoryNotFoundError

__all__ = [
    "ListBrandProducts",
    "ListCategoryProducts",
    "ListFeaturedProducts",
    "ListProviderProducts",
    "ListTodaysDeals",
    "OfferingRow",
]

_SORTS = {"price", "unit_price", "name", "popular"}


@dataclass
class _Aggregated:
    """Un producto ya agregado desde sus filas producto×tienda."""

    product_id: str
    name: str
    brand: str
    quality: str | None
    display_size: str | None
    image_url: str | None
    quantity: Quantity | None
    min_price: Money
    providers: dict[str, str]  # provider_id → provider_name (tiendas que lo tienen)
    slug: str = ""             # llave pública para el href de la card

    @property
    def unit_price_minor(self) -> int | None:
        """`None` cuando el producto no declara cantidad — ver `unit_price_or_none`."""
        precio = unit_price_or_none(self.min_price, self.quantity)
        return precio.amount_minor if precio else None

    @property
    def display_unit_price(self) -> DisplayUnitPrice | None:
        """El mismo precio en la unidad del ENVASE, que es como se lee. Ver `display_units.py`."""
        return display_unit_price_or_none(self.min_price, self.quantity, self.display_size)


def _aggregate(rows: Iterable[OfferingRow]) -> dict[str, _Aggregated]:
    out: dict[str, _Aggregated] = {}
    for r in rows:
        agg = out.get(r.product_id)
        if agg is None:
            out[r.product_id] = _Aggregated(
                r.product_id, r.name, r.brand, r.quality, r.display_size, r.image_url,
                r.quantity, r.price, {r.provider_id: r.provider_name}, slug=r.slug,
            )
            continue
        agg.providers[r.provider_id] = r.provider_name
        if r.price.amount_minor < agg.min_price.amount_minor:
            agg.min_price = r.price
    return out


_HISTOGRAM_BINS = 16
_BUCKET_STEP = 2500  # umbrales de rangos preset redondeados a 25 pesos (DOP)


def _price_distribution(prices: list[int]) -> tuple[list[int], list[PriceBucketDto]]:
    """Barras del histograma (16 bins) + 3 rangos preset con conteo (Imagen #5, filtro de precio)."""
    if not prices:
        return [], []
    lo, hi = min(prices), max(prices)
    if lo == hi:  # un solo nivel de precio: un bin, un bucket abierto
        return [len(prices)], [PriceBucketDto(min_minor=lo, max_minor=None, count=len(prices))]

    span = hi - lo
    histogram = [0] * _HISTOGRAM_BINS
    for p in prices:
        idx = min(_HISTOGRAM_BINS - 1, (p - lo) * _HISTOGRAM_BINS // span)
        histogram[idx] += 1

    # 3 rangos: umbrales a 1/3 y 2/3 del rango, redondeados a 25 pesos y forzados monotónicos.
    t1 = min(max(_round_to(lo + span // 3, _BUCKET_STEP), lo + 1), hi - 1)
    t2 = min(max(_round_to(lo + 2 * span // 3, _BUCKET_STEP), t1 + 1), hi)
    buckets = [
        PriceBucketDto(min_minor=lo, max_minor=t1, count=sum(1 for p in prices if p < t1)),
        PriceBucketDto(
            min_minor=t1, max_minor=t2, count=sum(1 for p in prices if t1 <= p < t2)
        ),
        PriceBucketDto(min_minor=t2, max_minor=None, count=sum(1 for p in prices if p >= t2)),
    ]
    return histogram, buckets


def _round_to(value: int, step: int) -> int:
    return (value + step // 2) // step * step


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
    histogram, buckets = _price_distribution(prices)
    return CategoryFacetsDto(
        price=PriceFacetDto(
            min_minor=min(prices) if prices else 0,
            max_minor=max(prices) if prices else 0,
            currency=currency,
            histogram=histogram,
            buckets=buckets,
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
        # Los sin cantidad van al FINAL (`is None` primero en la tupla): tratarlos como 0 los
        # pondría arriba de todo en «más barato por kilo». No son baratos — son incomparables.
        return lambda p: (p.unit_price_minor is None, p.unit_price_minor or 0, p.name)
    if sort == "name":
        return lambda p: p.name
    if sort == "popular":  # proxy de popularidad: disponible en MÁS tiendas primero
        return lambda p: (-len(p.providers), p.name)
    return lambda p: (p.min_price.amount_minor, p.name)  # "price" (default)


@dataclass(frozen=True)
class _Discount:
    """El badge «−X%» y el precio TACHADO, atados.

    Van juntos en un solo valor a propósito: son las dos caras de UNA bajada. Con dos mapas
    sueltos, el badge podía quedarse con la bajada mayor y el tachado con otra, y el card mostraría
    un porcentaje que no cuadra con el precio que tacha. Acá eso no se puede escribir.
    """

    bps: int
    previous_minor: int


def _to_card(p: _Aggregated, discount: _Discount | None = None) -> ProductCardDto:
    return ProductCardDto(
        id=p.product_id,
        slug=p.slug,
        name=p.name,
        brand=p.brand,
        quality=p.quality,
        display_size=p.display_size,
        # AL TAMAÑO QUE SE VE, no al que trae el CDN. Los originales son 1000×1000 y decodifican
        # 4 MB CADA UNO en el cliente, mientras la tarjeta los dibuja a 110pt. Ver `image_variant`:
        # es la diferencia entre 1.2 GB de RAM y unas decenas de MB.
        image_url=sized_image_url(p.image_url),
        price_minor=p.min_price.amount_minor,
        currency=p.min_price.currency.code,
        unit_price_minor=p.unit_price_minor,
        unit_measure=p.quantity.measure.value if p.quantity else None,
        display_unit_price_minor=p.display_unit_price.amount_minor if p.display_unit_price else None,
        display_unit=p.display_unit_price.label if p.display_unit_price else None,
        store_count=len(p.providers),
        discount_bps=discount.bps if discount else None,
        previous_price_minor=discount.previous_minor if discount else None,
    )


_DISCOUNT_WINDOW_DAYS = 30  # ventana para el badge "−X%" (bajada reciente = producto "en oferta")


def _keep_biggest(out: dict[str, _Discount], cid: str, drop) -> None:  # noqa: ANN001
    """Se queda con la bajada MAYOR de ese producto, arrastrando su precio anterior."""
    current = out.get(cid)
    if current is None or drop.drop_bps > current.bps:
        out[cid] = _Discount(drop.drop_bps, drop.change.previous.amount_minor)


def _discount_map(store_repo: StoreProductRepository, market_id: str) -> dict[str, _Discount]:
    """canonical_id → mayor bajada reciente. Reusa la detección G4 (detect_drops)."""
    since = datetime.now(timezone.utc) - timedelta(days=_DISCOUNT_WINDOW_DAYS)
    out: dict[str, _Discount] = {}
    for drop in detect_drops(store_repo.list_price_changes(market_id, since)):
        _keep_biggest(out, drop.change.canonical_product_id, drop)
    return out


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
        disc = _discount_map(self._store, market_id)

        filtered = [
            p for p in products.values() if _passes(p, stores, brands, price_min, price_max)
        ]
        sort = sort if sort in _SORTS else "price"
        ordered = sorted(filtered, key=_sort_key(sort))
        page = ordered[offset : offset + limit]

        # "popular": top de TODA la rama, sin los filtros de arriba — alimenta la plantilla
        # Overview cuando el nodo tiene subcategorías (§ CategoryListingDto).
        popular = sorted(products.values(), key=_sort_key("popular"))[:12]

        return CategoryListingDto(
            name=node.name,
            slug=node.slug,
            key=node.key,
            breadcrumb=[CategoryRefDto(name=n.name, slug=n.slug, key=n.key) for n in path],
            subcategories=[
                CategoryRefDto(name=c.name, slug=c.slug, key=c.key) for c in node.children
            ],
            total=len(ordered),
            products=[_to_card(p, disc.get(p.product_id)) for p in page],
            facets=facets,
            popular=[_to_card(p, disc.get(p.product_id)) for p in popular],
        )


class ListFeaturedProducts:
    """Rails de la home (Imagen #3): cards del mercado ordenadas por un criterio, sin categoría.

    'unit_price' → Mejor valor (A10) · 'popular' → Populares (A8, proxy = disponible en más
    tiendas) · 'price' → más baratos. Reusa la misma agregación producto×tienda.
    """

    def __init__(self, store_repo: StoreProductRepository) -> None:
        self._store = store_repo

    def execute(
        self, market_id: str, *, sort: str = "unit_price", limit: int = 12, offset: int = 0
    ) -> ProductCardPageDto:
        rows = self._store.list_market_offerings(market_id)
        products = _aggregate(rows)
        disc = _discount_map(self._store, market_id)
        sort = sort if sort in _SORTS else "unit_price"
        ordered = sorted(products.values(), key=_sort_key(sort))
        # El total sale de la lista ENTERA, antes de cortar: es lo que le dice al cliente si queda
        # algo más que pedir.
        page = ordered[offset : offset + limit]
        return ProductCardPageDto(
            items=[_to_card(p, disc.get(p.product_id)) for p in page],
            total=len(ordered),
        )


class ListBrandProducts:
    """'Más de la marca' (C8): otros productos de la MISMA marca que un producto dado."""

    def __init__(
        self, canonical_repo: CanonicalProductRepository, store_repo: StoreProductRepository
    ) -> None:
        self._canonical = canonical_repo
        self._store = store_repo

    def execute(self, product_id: str, *, limit: int = 12) -> list[ProductCardDto]:
        product = self._canonical.get_by_id(product_id)
        if product is None or not product.brand:
            return []
        products = _aggregate(self._store.list_market_offerings(product.market_id))
        same_brand = [
            p
            for p in products.values()
            if p.brand == product.brand and p.product_id != product_id
        ]
        same_brand.sort(key=_sort_key("unit_price"))
        return [_to_card(p) for p in same_brand[:limit]]


class ListSimilarProducts:
    """Alternativas a un producto: sus HERMANOS en la taxonomía, la más barata por unidad primero.

    Es el hermano de `ListBrandProducts` y responde a la pregunta contraria. Aquél dice «qué más
    hace esta marca» (fidelidad); éste dice «qué otra cosa puedo llevarme en lugar de ésta»
    (ahorro), que es la razón de ser de Save.

    ⭐ Quien decide el parecido es la TAXONOMÍA, nunca el nombre. Es la doctrina de discriminación:
    un token que nombra dos cosas no discrimina ninguna, y `word_similarity('aceite', 'Atún En
    Aceite')` vale 1.0 legítimamente. Subir un umbral no arregla eso — hay que traer una señal
    independiente, y aquí esa señal es el nodo del árbol. El nombre PROPONE; la estructura DISPONE.

    Se mira el nodo EXACTO del producto, no la rama entera: el nodo hoja es lo que hace que dos
    productos sean intercambiables. Subir al padre traería primos («arroz integral» para quien mira
    «arroz blanco») y una alternativa que no lo es cuesta más que ninguna alternativa.
    """

    def __init__(
        self, canonical_repo: CanonicalProductRepository, store_repo: StoreProductRepository
    ) -> None:
        self._canonical = canonical_repo
        self._store = store_repo

    def execute(self, product_id: str, *, limit: int = 12) -> list[ProductCardDto]:
        product = self._canonical.get_by_id(product_id)
        if product is None or not product.taxonomy_node_id:
            return []
        siblings = _aggregate(self._store.list_category_offerings([product.taxonomy_node_id]))
        alternatives = [p for p in siblings.values() if p.product_id != product_id]
        # Por unidad, no por precio a secas: un saco de 20 kg cuesta MÁS pesos y es más barato.
        alternatives.sort(key=_sort_key("unit_price"))
        return [_to_card(p) for p in alternatives[:limit]]


class ListTodaysDeals:
    """"Mejores ofertas de hoy" (A7): productos con bajada de precio reciente, mayor % primero.

    Atajo consciente de MVP (doc 08 §4 preveía una entidad `offer` de promociones propia; no hay
    ingesta de eso todavía): reusa el feed de bajadas de G4 (`detect_drops`) como proxy y lo cruza
    con la oferta VIGENTE del mercado para armar la card (precio/imagen/tamaño actuales, no los
    del momento de la bajada). Un producto con bajadas en varias tiendas cuenta una sola vez (la
    mayor); si ya no está en la oferta vigente, se descarta silenciosamente (no es un error).
    """

    def __init__(self, store_repo: StoreProductRepository) -> None:
        self._store = store_repo

    def execute(
        self,
        market_id: str,
        *,
        days: int = 7,
        limit: int = 12,
        offset: int = 0,
        now: datetime | None = None,
    ) -> ProductCardPageDto:
        since = (now or datetime.now(timezone.utc)) - timedelta(days=days)
        changes = self._store.list_price_changes(market_id, since)
        drops = detect_drops(changes)  # ya viene ordenado por drop_bps desc

        ordered_ids: list[str] = []
        disc: dict[str, _Discount] = {}
        for drop in drops:
            pid = drop.change.canonical_product_id
            if pid not in disc:
                ordered_ids.append(pid)  # primera aparición = mayor bajada (drops viene ordenado)
            _keep_biggest(disc, pid, drop)

        products = _aggregate(self._store.list_market_offerings(market_id))
        # Se arma la lista COMPLETA antes de cortar, y a propósito: el filtro `if pid in products`
        # descarta bajadas cuyo producto ya no está en la oferta vigente, así que el total honesto
        # es el de las que SOBREVIVEN. Contar las bajadas crudas mandaría al cliente a pedir
        # páginas que no existen.
        cards = [_to_card(products[pid], disc.get(pid)) for pid in ordered_ids if pid in products]
        return ProductCardPageDto(items=cards[offset : offset + limit], total=len(cards))


class ListProviderProducts:
    """Catálogo de UN supermercado (A9: "Ofertas por supermercado"), página propia por tienda.

    Filtra las filas del mercado a ese `provider_id` ANTES de agregar → cada card muestra el
    precio de ESA tienda (no el mínimo cross-tienda) y `store_count` sale en 1, lo honesto para
    una vista de una sola tienda.
    """

    def __init__(self, store_repo: StoreProductRepository) -> None:
        self._store = store_repo

    def execute(self, market_id: str, provider_id: str, *, limit: int = 48) -> list[ProductCardDto]:
        rows = [
            r for r in self._store.list_market_offerings(market_id) if r.provider_id == provider_id
        ]
        products = _aggregate(rows)
        ordered = sorted(products.values(), key=_sort_key("name"))
        return [_to_card(p) for p in ordered[:limit]]
