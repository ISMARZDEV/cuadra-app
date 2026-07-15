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
