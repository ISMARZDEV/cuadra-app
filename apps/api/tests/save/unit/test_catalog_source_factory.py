"""Unit — `CatalogSourceFactory`: dispatch platform -> adapter (F2·B1/B3, Batch 3B, tarea 3.7).

Generaliza el wiring hoy hardcodeado en `ingestion/save/sources.py::build_sources` (Jumbo: header
`Store: jumbo` -> `MagentoAdapter(store_code="jumbo")`). `store_registry` no carga `query`/
`market_id` (esos viven en `basket_query`, tareas 3.13-3.16, aún sin aterrizar) -> `build()`
devuelve un `SourceBuilder` parcial; `for_query(provider_id, market_id, query)` cierra los datos
que faltan. El wiring completo multi-query llega cuando `basket_query` esté disponible.
"""
from __future__ import annotations

import pytest

from src.contexts.save.domain.entities import SourcePlatform
from src.contexts.save.infrastructure.catalog_sources.factory import CatalogSourceFactory
from src.contexts.save.infrastructure.catalog_sources.magento_adapter import MagentoAdapter
from src.contexts.save.infrastructure.catalog_sources.rest_catalog_adapter import RestCatalogAdapter
from src.contexts.save.infrastructure.catalog_sources.vtex_adapter import VtexAdapter


def test_build_vtex_for_query_returns_vtex_adapter() -> None:
    builder = CatalogSourceFactory.build(SourcePlatform.VTEX, "https://www.sirena.do")

    source = builder.for_query("provider-1", "DO", "arroz")

    assert isinstance(source, VtexAdapter)


def test_build_magento_with_store_header_extracts_store_code() -> None:
    builder = CatalogSourceFactory.build(
        SourcePlatform.MAGENTO, "https://jumbo.com.do", headers={"Store": "jumbo"},
    )

    assert builder.store_code == "jumbo"
    source = builder.for_query("provider-1", "DO", "arroz")
    assert isinstance(source, MagentoAdapter)


def test_build_magento_without_store_header_has_no_store_code() -> None:
    builder = CatalogSourceFactory.build(SourcePlatform.MAGENTO, "https://supermercadosnacional.com")

    assert builder.store_code is None


def test_build_unsupported_platform_raises_clear_error() -> None:
    with pytest.raises(ValueError, match="sin adapter"):
        CatalogSourceFactory.build(SourcePlatform.SHOPIFY, "https://x.myshopify.com")


def test_build_rest_catalog_returns_rest_catalog_adapter() -> None:
    # REST_CATALOG resuelve el profile + secciones + tienda desde `endpoints` (StoreRegistry).
    builder = CatalogSourceFactory.build(
        SourcePlatform.REST_CATALOG,
        "https://bravova-api.superbravo.com.do",
        endpoints={"profile": "bravova", "sections": ["3"], "store_id": "1000"},
    )

    source = builder.for_query("provider-1", "DO", "arroz")  # query se ignora (browse-full)

    assert isinstance(source, RestCatalogAdapter)


def test_build_rest_catalog_unknown_profile_raises() -> None:
    builder = CatalogSourceFactory.build(
        SourcePlatform.REST_CATALOG,
        "https://x.test",
        endpoints={"profile": "no-existe", "sections": ["1"], "store_id": "1"},
    )
    with pytest.raises(ValueError, match="profile"):
        builder.for_query("p", "DO", "q")


def test_build_rest_catalog_missing_endpoints_raises() -> None:
    builder = CatalogSourceFactory.build(SourcePlatform.REST_CATALOG, "https://x.test")
    with pytest.raises(ValueError):
        builder.for_query("p", "DO", "q")
