"""Unit — `build_directed_adapter` (wiring de producción de Loop B, F3.1): arma el adapter REAL de la
plataforma apuntado a la consulta dirigida. Config PURA (sin red), como `test_sources.py`.
"""
from __future__ import annotations

from ingestion.save.composition import build_directed_adapter
from src.contexts.save.domain.directed_query import DirectedQuery
from src.contexts.save.domain.entities import (
    Provider,
    ProviderType,
    SourcePlatform,
    StoreRegistry,
)
from src.contexts.save.infrastructure.catalog_sources.magento_adapter import MagentoAdapter
from src.contexts.save.infrastructure.catalog_sources.rest_catalog_adapter import RestCatalogAdapter
from src.contexts.save.infrastructure.catalog_sources.vtex_adapter import VtexAdapter


def _provider(platform: SourcePlatform) -> Provider:
    return Provider("p1", "Tienda", ProviderType.SUPERMARKET, platform, "DO")


def test_builds_vtex_adapter_pointed_at_the_directed_query() -> None:
    source = StoreRegistry("s1", "p1", SourcePlatform.VTEX, "https://sirena.do")
    query = DirectedQuery(text="7460083780023", by_ean=True)

    adapter = build_directed_adapter(source, _provider(SourcePlatform.VTEX), query)

    assert isinstance(adapter, VtexAdapter)
    assert adapter._query == "7460083780023"
    assert adapter._provider_id == "p1"
    assert adapter._market_id == "DO"
    assert adapter._base_url == "https://sirena.do"


def test_builds_magento_adapter_for_magento_platform() -> None:
    source = StoreRegistry("s2", "p1", SourcePlatform.MAGENTO, "https://supermercadosnacional.com")
    query = DirectedQuery(text="Arroz La Garza 20 Lb", by_ean=False)

    adapter = build_directed_adapter(source, _provider(SourcePlatform.MAGENTO), query)

    assert isinstance(adapter, MagentoAdapter)
    assert adapter._query == "Arroz La Garza 20 Lb"


def test_rest_catalog_directed_by_ean_gets_a_single_request_adapter() -> None:
    """Wiring de producción del hallazgo 2026-07-15: `DirectedQuery.by_ean` tiene que LLEGAR al
    factory. Antes se pasaba solo `query.text` y el `by_ean` se perdía → Bravo habría navegado el
    catálogo entero en vez de hacer el lookup exacto."""
    source = StoreRegistry(
        "s2", "p-bravo", SourcePlatform.REST_CATALOG, "https://bravova-api.test",
        endpoints={"profile": "bravova", "store_id": "1000", "sections": ["14", "15"]},
    )
    query = DirectedQuery(text="7460083780023", by_ean=True)

    adapter = build_directed_adapter(source, _provider(SourcePlatform.REST_CATALOG), query)

    assert isinstance(adapter, RestCatalogAdapter)
    assert adapter._ean == "7460083780023"
