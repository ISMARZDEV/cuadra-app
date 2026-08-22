"""Unit — use cases de Save (§6): SearchProducts + CompareProduct. Con repos FAKE (sin DB).

CompareProduct es el corazón del valor: dado un producto canónico, arma la tabla comparativa
(la misma de SupermercadosRD) delegando en el domain service. El precio NUNCA lo calcula el
use case: viene del repo y se compara con la money-math del dominio.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from src.contexts.save.application.compare import CompareProduct
from src.contexts.save.application.errors import CanonicalProductNotFoundError
from src.contexts.save.application.products import ListProducts
from src.contexts.save.application.search import SearchProducts
from src.contexts.save.domain.canonical_image import CanonicalImage
from src.contexts.save.domain.comparison import StoreQuote
from src.contexts.save.domain.entities import CanonicalProduct, MatchCandidate
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure
from src.shared.money import Currency, Money

DOP = Currency("DOP")


class FakeCanonicalRepo:
    def __init__(self, products: list[CanonicalProduct]) -> None:
        self._p = {p.id: p for p in products}

    def add(self, product: CanonicalProduct) -> None:  # pragma: no cover
        self._p[product.id] = product

    def get_by_id(self, product_id: str) -> CanonicalProduct | None:
        return self._p.get(product_id)

    def get_by_slug(self, slug: str, market_id: str) -> CanonicalProduct | None:
        return next(
            (p for p in self._p.values() if p.slug == slug and p.market_id == market_id), None
        )

    def search(self, query: str, market_id: str) -> list[CanonicalProduct]:
        return [
            p for p in self._p.values()
            if query.lower() in p.name.lower() and p.market_id == market_id
        ]

    def search_lexical(self, query: str, market_id: str, limit: int = 20):  # type: ignore[no-untyped-def]
        # Fake léxico: substring. La etapa real es trgm — la cubren test_hybrid_search (unit) y
        # test_api (integración, contra el SQL de verdad).
        return [
            MatchCandidate(canonical_product_id=p.id, score=1.0)
            for p in self._p.values()
            if query.lower() in p.name.lower() and p.market_id == market_id
        ][:limit]

    def search_semantic(self, embedding: list[float], market_id: str, limit: int = 20):  # type: ignore[no-untyped-def]
        return []

    def get_many(self, product_ids, market_id: str) -> list[CanonicalProduct]:  # type: ignore[no-untyped-def]
        return [self._p[pid] for pid in product_ids if pid in self._p]

    def list_by_market(
        self, market_id: str, limit: int = 1000, offset: int = 0
    ) -> list[CanonicalProduct]:
        products = sorted(
            (p for p in self._p.values() if p.market_id == market_id), key=lambda p: p.id
        )
        return products[offset : offset + limit]


class FakeStoreRepo:
    def __init__(self, quotes: dict[str, list[StoreQuote]]) -> None:
        self._q = quotes

    def list_quotes_by_canonical(self, canonical_product_id: str) -> list[StoreQuote]:
        return self._q.get(canonical_product_id, [])


def _canonical(cid: str, name: str, measure: UnitMeasure = UnitMeasure.MASS) -> CanonicalProduct:
    from src.contexts.save.domain.slug import product_slug
    return CanonicalProduct(
        cid, name, "La Garza", Quantity(Decimal("2"), measure), "t", "DO",
        slug=product_slug(name, "La Garza"),
    )


def test_compare_product_builds_sorted_table() -> None:
    canonical = _canonical("c1", "Arroz La Garza")
    quotes = {
        "c1": [
            StoreQuote("p-sirena", "Sirena", Money(47500, DOP)),
            StoreQuote("p-merca", "Merca", Money(42400, DOP)),
            StoreQuote("p-bravo", "Bravo", Money(43800, DOP)),
        ]
    }
    uc = CompareProduct(FakeCanonicalRepo([canonical]), FakeStoreRepo(quotes))
    dto = uc.execute("arroz-la-garza", "DO")

    assert dto.name == "Arroz La Garza"
    assert dto.slug == "arroz-la-garza"
    assert [e.provider_name for e in dto.entries] == ["Merca", "Bravo", "Sirena"]
    assert dto.entries[0].is_cheapest is True
    assert dto.entries[0].price_minor == 42400
    assert dto.entries[0].unit_price_minor == 21200  # 42400 / 2kg
    assert dto.entries[1].extra_minor == 1400        # +RD$14.00
    assert dto.cheapest_provider == "Merca"
    assert dto.spread_minor == 5100                  # 475 - 424


def test_compare_product_not_found_raises() -> None:
    uc = CompareProduct(FakeCanonicalRepo([]), FakeStoreRepo({}))
    with pytest.raises(CanonicalProductNotFoundError):
        uc.execute("nope", "DO")


def test_compare_product_falls_back_to_id_when_not_a_slug() -> None:
    # las páginas privadas (lista local, feed de alertas) linkean por UUID, no por slug legible.
    canonical = _canonical("c1", "Arroz La Garza")  # slug = "arroz-la-garza", id = "c1"
    quotes = {"c1": [StoreQuote("p-merca", "Merca", Money(42400, DOP))]}
    uc = CompareProduct(FakeCanonicalRepo([canonical]), FakeStoreRepo(quotes))
    dto = uc.execute("c1", "DO")  # "c1" no es el slug → fallback por id
    assert dto.canonical_product_id == "c1"
    assert dto.slug == "arroz-la-garza"


def test_search_products_filters_by_query_and_market() -> None:
    a = _canonical("c1", "Arroz La Garza")
    b = _canonical("c2", "Aceite Crisol", UnitMeasure.VOLUME)
    uc = SearchProducts(FakeCanonicalRepo([a, b]))
    res = uc.execute("arroz", "DO")
    assert [r.id for r in res] == ["c1"]
    assert res[0].name == "Arroz La Garza"


def test_list_products_returns_all_in_market_for_sitemap() -> None:
    a = _canonical("c1", "Arroz La Garza")
    b = _canonical("c2", "Aceite Crisol", UnitMeasure.VOLUME)
    uc = ListProducts(FakeCanonicalRepo([a, b]))
    res = uc.execute("DO")
    assert {r.id for r in res} == {"c1", "c2"}


def test_compare_product_carries_the_description() -> None:
    """La descripción YA vivía en la entidad y no salía por la API.

    La pantalla de detalle la pinta, y sin este campo habría que pedir el producto por segunda vez
    a otro endpoint para leer un dato que la comparación ya tenía en la mano.
    """
    canonical = CanonicalProduct(
        "c1", "Arroz La Garza", "La Garza", Quantity(Decimal("2"), UnitMeasure.MASS), "t", "DO",
        slug="arroz-la-garza",
        description="Arroz blanco de grano largo, cosecha nacional.",
    )
    quotes = {"c1": [StoreQuote("p-merca", "Merca", Money(42400, DOP))]}
    uc = CompareProduct(FakeCanonicalRepo([canonical]), FakeStoreRepo(quotes))

    dto = uc.execute("arroz-la-garza", "DO")

    assert dto.description == "Arroz blanco de grano largo, cosecha nacional."


def test_compare_product_description_is_none_when_absent() -> None:
    """`None`, no cadena vacía: la pantalla decide con eso si dibuja el bloque y su «Leer más»."""
    canonical = _canonical("c1", "Arroz La Garza")
    quotes = {"c1": [StoreQuote("p-merca", "Merca", Money(42400, DOP))]}
    uc = CompareProduct(FakeCanonicalRepo([canonical]), FakeStoreRepo(quotes))

    assert uc.execute("arroz-la-garza", "DO").description is None


# ── La galería del detalle (carrusel de fotos del producto) ──────────────────────────────────────
#
# La galería vive en `canonical_product_image` y hasta ahora sólo la veía el admin: el endpoint
# público devolvía `image_url`, la posición 1 denormalizada, y el móvil no tenía forma de saber que
# había más fotos. Sin esto, el carrusel del detalle sería un carrusel de una sola imagen.


class FakeImageRepo:
    """El puerto `CanonicalImageRepository`, con lo justo que el detalle público consume."""

    def __init__(self, images: dict[str, list[CanonicalImage]]) -> None:
        self._images = images

    def list_images(self, canonical_product_id: str) -> list[CanonicalImage]:
        return list(self._images.get(canonical_product_id, []))


PRIMARY_URL = "https://cdn/una.jpg"


def _comparable(image_url: str | None = PRIMARY_URL) -> tuple[CanonicalProduct, dict]:
    """Un canónico comparable, con su imagen PÚBLICA (la posición 1 denormalizada)."""
    from src.contexts.save.domain.slug import product_slug

    canonical = CanonicalProduct(
        "c1", "Arroz La Garza", "La Garza", Quantity(Decimal("2"), UnitMeasure.MASS), "t", "DO",
        slug=product_slug("Arroz La Garza", "La Garza"),
        image_url=image_url,
    )
    return canonical, {"c1": [StoreQuote("p-merca", "Merca", Money(42400, DOP))]}


def test_compare_product_returns_the_whole_gallery_in_position_order() -> None:
    canonical, quotes = _comparable()
    # A propósito DESORDENADAS: quien las pide no puede depender de cómo se las devuelva el
    # almacén, o el carrusel enseñaría la 3ra foto primero en cuanto cambie una consulta.
    images = {
        "c1": [
            CanonicalImage("i3", "https://cdn/tres.jpg", 3),
            CanonicalImage("i1", "https://cdn/una.jpg", 1),
            CanonicalImage("i2", "https://cdn/dos.jpg", 2),
        ]
    }
    uc = CompareProduct(
        FakeCanonicalRepo([canonical]),
        FakeStoreRepo(quotes),
        image_repo=FakeImageRepo(images),
    )
    dto = uc.execute("arroz-la-garza", "DO")

    assert dto.image_urls == [
        "https://cdn/una.jpg",
        "https://cdn/dos.jpg",
        "https://cdn/tres.jpg",
    ]


def test_compare_product_gallery_starts_with_the_public_image() -> None:
    # ⚠️ INVARIANTE del modelo: `canonical_product.image_url` ES la posición 1. Si la galería no
    # empezara por ella, el carrusel abriría en una foto distinta de la que el usuario acaba de
    # tocar en la rejilla — y eso se lee como que entró al producto equivocado.
    canonical, quotes = _comparable()
    images = {
        "c1": [
            CanonicalImage("i2", "https://cdn/dos.jpg", 2),
            CanonicalImage("i1", PRIMARY_URL, 1),
        ]
    }
    uc = CompareProduct(
        FakeCanonicalRepo([canonical]),
        FakeStoreRepo(quotes),
        image_repo=FakeImageRepo(images),
    )
    dto = uc.execute("arroz-la-garza", "DO")

    assert dto.image_urls[0] == dto.image_url


def test_compare_product_without_image_repo_still_answers() -> None:
    # El repositorio es OPCIONAL, como el de taxonomía: el detalle es el corazón de Save y no puede
    # caerse porque falte una dependencia decorativa. Sin galería, cae a la imagen pública sola.
    canonical, quotes = _comparable()
    uc = CompareProduct(FakeCanonicalRepo([canonical]), FakeStoreRepo(quotes))
    dto = uc.execute("arroz-la-garza", "DO")

    assert dto.image_urls == [dto.image_url]


def test_compare_product_without_any_image_returns_an_empty_gallery() -> None:
    # Un producto sin foto no puede colar un `None` en la lista: el móvil lo pintaría como una
    # diapositiva en blanco con su puntito, prometiendo una imagen que no existe.
    canonical, quotes = _comparable(image_url=None)
    uc = CompareProduct(
        FakeCanonicalRepo([canonical]),
        FakeStoreRepo(quotes),
        image_repo=FakeImageRepo({}),
    )
    dto = uc.execute("arroz-la-garza", "DO")

    assert dto.image_urls == []
