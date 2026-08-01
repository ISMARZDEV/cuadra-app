"""Unit — "no sé la marca" (`None`) ≠ "la marca es vacía" (`""`).

`record_observation` ya protege los atributos crudos con `if brand is not None` ("nunca los borra
con None"), pero Magento y Bravo mandaban `""`, que PASA ese filtro. Resultado: cada corrida de
ingesta re-escribía `store_product.brand = ""`, así que cualquier marca resuelta por otra vía se
borraba en el siguiente ciclo — un borrado silencioso, sin error ni log.

Ninguna de las dos APIs expone marca (verificado en vivo 2026-07-30: el `brand_text` de Magento
viene vacío en todo el catálogo y no hay faceta de marca; el `marcaArticulo` de Bravo son 4 códigos
internos —"01"/"03"/"04"— que agrupan por TIPO de producto, no por marca: "01" lo comparten BRAVO y
LA ANTORCHA). Así que lo correcto es decir `None` = "no lo sé", y dejar el campo intacto.
"""
from __future__ import annotations

from src.contexts.save.infrastructure.catalog_sources.bravova_profile import map_bravova_item
from src.contexts.save.infrastructure.catalog_sources.magento_adapter import map_magento_product

_MAGENTO_ITEM = {
    "name": "Arroz Selecto Líder 10 Lb",
    "sku": "2140283",
    "url_key": "arroz-selecto-lider-10-lb-2140283",
    "price_range": {"minimum_price": {"final_price": {"value": 545, "currency": "DOP"}}},
}

_BRAVO_ITEM = {
    "idexternoArticulo": "29866",
    "idArticulo": 29866,
    "nombreArticulo": "LA GARZA ARROZ 10 LB",
    "associatedPvp": 545,
    # el código interno que NO es una marca — está para que quede claro que se ignora a propósito
    "marcaArticulo": "01",
}


def test_magento_says_it_does_not_know_the_brand_instead_of_saying_it_is_empty() -> None:
    entry = map_magento_product(
        _MAGENTO_ITEM, "prov-1", "DO", "https://supermercadosnacional.com"
    )

    assert entry.brand is None


def test_bravo_ignores_its_internal_code_and_says_it_does_not_know_the_brand() -> None:
    entry = map_bravova_item(_BRAVO_ITEM, "prov-2", "DO")

    # "01" agrupa por tipo de producto, no por marca: tomarlo como marca sería inventar catálogo
    assert entry.brand is None


def test_an_unknown_brand_never_overwrites_one_already_known(db_session) -> None:  # type: ignore[no-untyped-def]
    """El invariante de verdad: dos observaciones seguidas sin marca no pueden borrar la que había."""
    import uuid
    from datetime import datetime, timezone

    from src.contexts.save.domain.entities import PriceType, Provider, ProviderType, SourcePlatform
    from src.contexts.save.infrastructure.models import StoreProductModel
    from src.contexts.save.infrastructure.repositories import (
        SqlProviderRepository,
        SqlStoreProductRepository,
    )
    from src.shared.money import Currency, Money

    pid = str(uuid.uuid4())
    SqlProviderRepository(db_session).add(
        Provider(pid, "Bravo", ProviderType.SUPERMARKET, SourcePlatform.REST_CATALOG, "DO")
    )
    repo = SqlStoreProductRepository(db_session)
    common = {
        "provider_id": pid, "external_id": "sku-1", "canonical_product_id": None,
        "price": Money(54500, Currency("DOP")), "captured_at": datetime.now(timezone.utc),
        "price_type": PriceType.ONLINE, "source": "bravova",
    }

    sp_id = repo.record_observation(**common, name="LA GARZA ARROZ 10 LB", brand="LA GARZA")
    repo.record_observation(**common, name="LA GARZA ARROZ 10 LB", brand=None)

    assert db_session.get(StoreProductModel, uuid.UUID(sp_id)).brand == "LA GARZA"
