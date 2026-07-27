"""Unit — captura de TODAS las imágenes y de la descripción en los adapters (F5, tarea 9).

Hasta ahora cada adapter se quedaba con UNA imagen y descartaba el resto, aunque el payload ya
las traía: `vtex_adapter` hacía `images[0]` sobre un array, y Bravo construía `_1.png` teniendo
`nimgArticulo` (la CANTIDAD) a mano. La descripción no se capturaba en ninguno.

Eso importa porque la galería del canónico (posiciones 1ª, 2ª, 3ª) se alimenta de estas
candidatas: sin las imágenes extra, la galería sólo puede ofrecer una foto por tienda.

Regla que estos tests fijan: el ORDEN de la tienda se preserva. La tienda pone primero la foto del
producto y después la etiqueta nutricional; invertirlo pondría la tabla de nutrición como imagen
principal del catálogo.
"""
from __future__ import annotations

from src.contexts.save.infrastructure.catalog_sources.bravova_profile import map_bravova_item
from src.contexts.save.infrastructure.catalog_sources.magento_adapter import map_magento_product
from src.contexts.save.infrastructure.catalog_sources.vtex_adapter import map_vtex_product

PROVIDER = "11111111-1111-4111-8111-111111111111"
BASE_URL = "https://supermercadosnacional.com"
MARKET = "DO"


def _vtex(images: list[dict], **extra) -> dict:  # type: ignore[no-untyped-def]
    item = {
        "productId": "123",
        "productName": "Arroz Bisono 50 Lb",
        "brand": "BISONO",
        "items": [
            {
                "itemId": "1",
                "ean": "0781086020518",
                "images": images,
                "sellers": [
                    {
                        "sellerId": "1",
                        "commertialOffer": {
                            "Price": 2125.0,
                            "ListPrice": 2125.0,
                            "AvailableQuantity": 10,
                        },
                    }
                ],
            }
        ],
    }
    item.update(extra)
    return item


class TestVtexImages:
    def test_it_captures_EVERY_image_not_just_the_first(self) -> None:
        """Es el caso de Sirena: bolsa + etiqueta nutricional. Nos quedábamos con la bolsa."""
        entry = map_vtex_product(
            _vtex(
                [
                    {"imageUrl": "https://cdn/bolsa.jpg"},
                    {"imageUrl": "https://cdn/nutricional.jpg"},
                ]
            ),
            PROVIDER,
            MARKET,
        )

        assert entry.image_urls == (
            "https://cdn/bolsa.jpg",
            "https://cdn/nutricional.jpg",
        )

    def test_the_store_order_is_preserved(self) -> None:
        """La tienda pone la foto del producto primero. Invertirlo pondría la tabla nutricional
        como imagen principal del catálogo."""
        entry = map_vtex_product(
            _vtex([{"imageUrl": "https://cdn/a.jpg"}, {"imageUrl": "https://cdn/b.jpg"}]),
            PROVIDER,
            MARKET,
        )

        assert entry.primary_image_url == "https://cdn/a.jpg"

    def test_no_images_yields_an_empty_tuple_not_a_none_entry(self) -> None:
        entry = map_vtex_product(_vtex([]), PROVIDER, MARKET)

        assert entry.image_urls == ()
        assert entry.primary_image_url is None

    def test_an_image_without_url_is_skipped(self) -> None:
        entry = map_vtex_product(
            _vtex([{"imageUrl": "https://cdn/a.jpg"}, {"imageLabel": "sin url"}]),
            PROVIDER,
            MARKET,
        )

        assert entry.image_urls == ("https://cdn/a.jpg",)

    def test_duplicated_urls_are_collapsed(self) -> None:
        """VTEX repite la misma imagen en varios tamaños del mismo item. Dos posiciones con la
        misma foto no es una galería."""
        entry = map_vtex_product(
            _vtex([{"imageUrl": "https://cdn/a.jpg"}, {"imageUrl": "https://cdn/a.jpg"}]),
            PROVIDER,
            MARKET,
        )

        assert entry.image_urls == ("https://cdn/a.jpg",)


class TestVtexDescription:
    def test_it_captures_the_description(self) -> None:
        entry = map_vtex_product(
            _vtex([], description="Arroz de grano largo y calidad premium."),
            PROVIDER,
            MARKET,
        )

        assert entry.description == "Arroz de grano largo y calidad premium."

    def test_it_falls_back_to_the_meta_description(self) -> None:
        """Algunas tiendas VTEX dejan `description` vacío y sólo llenan el meta tag."""
        entry = map_vtex_product(
            _vtex([], description="", metaTagDescription="Arroz enriquecido."),
            PROVIDER,
            MARKET,
        )

        assert entry.description == "Arroz enriquecido."

    def test_without_any_description_it_stays_none(self) -> None:
        """`None` y no cadena vacía: "la tienda no la trae" es distinto de "la trae vacía"."""
        assert map_vtex_product(_vtex([]), PROVIDER, MARKET).description is None


class TestBravoImages:
    """Bravo no manda URLs: manda `nimgArticulo` (CUÁNTAS hay) y la URL lleva índice
    (`{idext}_1.png`). Teníamos el patrón completo y usábamos sólo la primera."""

    def _item(self, nimg: int) -> dict:
        return {
            "idexternoArticulo": "29866",
            "idArticulo": 29866,
            "nombreArticulo": "Arroz Selecto 5 Lb",
            "imageCatalogVersion": 7,
            "nimgArticulo": nimg,
            "associatedPvp": 250.0,
        }

    def test_it_builds_one_url_per_declared_image(self) -> None:
        entry = map_bravova_item(self._item(3), PROVIDER, MARKET)

        assert len(entry.image_urls) == 3
        assert entry.image_urls[0].endswith("29866_1.png?v=7")
        assert entry.image_urls[1].endswith("29866_2.png?v=7")
        assert entry.image_urls[2].endswith("29866_3.png?v=7")

    def test_one_image_behaves_like_before(self) -> None:
        entry = map_bravova_item(self._item(1), PROVIDER, MARKET)

        assert len(entry.image_urls) == 1
        assert entry.primary_image_url is not None

    def test_zero_images_yields_nothing(self) -> None:
        assert map_bravova_item(self._item(0), PROVIDER, MARKET).image_urls == ()

    def test_an_absurd_count_is_capped(self) -> None:
        """`nimgArticulo` viene del proveedor: un valor disparatado generaría cientos de URLs
        inventadas que además nadie validó que existan."""
        entry = map_bravova_item(self._item(500), PROVIDER, MARKET)

        assert len(entry.image_urls) <= 10


class TestMagentoImages:
    def _item(self, gallery: list[dict], description: str | None = None) -> dict:
        item = {
            "name": "Habichuelas Pintas 15 Onz",
            "sku": "2135014",
            "url_key": "habichuelas",
            "price_range": {
                "minimum_price": {"final_price": {"value": 95.0, "currency": "DOP"}}
            },
            "small_image": {"url": "https://cdn/small.jpg"},
            "media_gallery": gallery,
            "categories": [{"name": "Despensa", "level": 2}],
        }
        if description is not None:
            item["description"] = {"html": description}
        return item

    def test_it_captures_the_whole_media_gallery(self) -> None:
        entry = map_magento_product(
            self._item(
                [
                    {"url": "https://cdn/a.jpg", "position": 1},
                    {"url": "https://cdn/b.jpg", "position": 2},
                ]
            ),
            PROVIDER,
            MARKET,
            BASE_URL,
        )

        assert entry.image_urls == ("https://cdn/a.jpg", "https://cdn/b.jpg")

    def test_the_gallery_is_sorted_by_its_declared_position(self) -> None:
        """Magento no garantiza el orden del array; el orden real está en `position`."""
        entry = map_magento_product(
            self._item(
                [
                    {"url": "https://cdn/segunda.jpg", "position": 2},
                    {"url": "https://cdn/primera.jpg", "position": 1},
                ]
            ),
            PROVIDER,
            MARKET,
            BASE_URL,
        )

        assert entry.primary_image_url == "https://cdn/primera.jpg"

    def test_without_a_gallery_it_falls_back_to_the_small_image(self) -> None:
        """Que la tienda no publique galería no puede dejar al producto SIN imagen: la que ya
        teníamos sigue siendo válida."""
        entry = map_magento_product(self._item([]), PROVIDER, MARKET, BASE_URL)

        assert entry.image_urls == ("https://cdn/small.jpg",)

    def test_it_captures_the_description(self) -> None:
        entry = map_magento_product(
            self._item([], description="<p>Habichuelas de primera.</p>"), PROVIDER, MARKET, BASE_URL
        )

        assert entry.description is not None
        # El HTML se limpia: la descripción va a una UI que no renderiza markup de la tienda.
        assert "<p>" not in entry.description
        assert "Habichuelas de primera." in entry.description
