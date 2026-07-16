"""Unit — `CatalogSourceFactory`: dispatch platform -> adapter (F2·B1/B3, Batch 3B, tarea 3.7).

Generaliza el wiring hoy hardcodeado en `ingestion/save/sources.py::build_sources` (Jumbo: header
`Store: jumbo` -> `MagentoAdapter(store_code="jumbo")`). `store_registry` no carga `query`/
`market_id` (esos viven en `basket_query`, tareas 3.13-3.16, aún sin aterrizar) -> `build()`
devuelve un `SourceBuilder` parcial; `for_query(provider_id, market_id, query)` cierra los datos
que faltan. El wiring completo multi-query llega cuando `basket_query` esté disponible.
"""
from __future__ import annotations

import pytest

from src.contexts.save.domain.directed_query import DirectedCapability
from src.contexts.save.domain.entities import SourcePlatform
from src.contexts.save.infrastructure.catalog_sources.factory import (
    CatalogSourceFactory,
    directed_capability,
)
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


_BRAVO_UA = "Domicilio/122130 CFNetwork/3826.500.131 Darwin/24.5.0"


def test_rest_profile_supplies_structural_headers_without_admin_config() -> None:
    """El profile aporta los headers ESTRUCTURALES fijos de la plataforma (Bravo: User-Agent
    'Domicilio/…' + Accept*) SIN que el admin los configure. Solo el token (secreto) vive en `auth`.
    Antes había que copiar el User-Agent a mano en `store_registry.headers` o el `/get` daba 403."""
    builder = CatalogSourceFactory.build(
        SourcePlatform.REST_CATALOG,
        "https://bravova-api.superbravo.com.do",
        endpoints={"profile": "bravova", "sections": ["3"], "store_id": "1000"},
        auth={"in": "header", "name": "X-Auth-Token", "type": "api_key", "value": "TKN"},
        # headers NO trae User-Agent: el punto es que ya no sea obligatorio en el admin.
    )

    headers = builder._request_auth().headers

    assert headers["User-Agent"] == _BRAVO_UA
    assert headers["Accept"] == "*/*"
    assert headers["X-Auth-Token"] == "TKN"  # el secreto sigue viniendo del admin (auth)


def test_registry_headers_override_profile_defaults() -> None:
    """Retrocompat: si el admin AÚN trae un header (config previa), gana sobre el default del profile."""
    builder = CatalogSourceFactory.build(
        SourcePlatform.REST_CATALOG,
        "https://bravova-api.superbravo.com.do",
        endpoints={"profile": "bravova", "sections": ["3"], "store_id": "1000"},
        headers={"User-Agent": "Domicilio/OVERRIDE"},
    )

    assert builder._request_auth().headers["User-Agent"] == "Domicilio/OVERRIDE"


def test_non_rest_platforms_unaffected_by_profile_headers() -> None:
    """VTEX/Magento no tienen profile → siguen con el único default base (Cuadra/Save)."""
    builder = CatalogSourceFactory.build(SourcePlatform.VTEX, "https://www.sirena.do")

    assert builder._request_auth().headers == {"User-Agent": "Cuadra/Save"}


# ── directed_capability: la capacidad REAL de la fuente (profile-aware) ───────────────────────
# El dominio solo puede deducir la capacidad de la PLATAFORMA, y para REST_CATALOG eso obliga a
# asumir browse-only. Infraestructura conoce los profiles y puede afinarlo: Bravo declara
# `ean_param="model.filterByEan"` → sí admite consulta dirigida por barcode (verificado en vivo).


def test_rest_catalog_with_ean_param_in_its_profile_is_directed_by_ean() -> None:
    cap = directed_capability(SourcePlatform.REST_CATALOG, {"profile": "bravova"})
    assert cap == DirectedCapability(supported=True, by_ean=True)


def test_rest_catalog_with_unknown_profile_stays_browse_only() -> None:
    # Profile no registrado → no sabemos nada de la fuente → el default conservador manda.
    # NO revienta: la capacidad es una PREGUNTA, no la construcción del adapter.
    assert directed_capability(SourcePlatform.REST_CATALOG, {"profile": "no-existe"}) == (
        DirectedCapability(supported=False, by_ean=False)
    )
    assert directed_capability(SourcePlatform.REST_CATALOG, None).supported is False


def test_non_rest_platforms_keep_the_platform_default() -> None:
    # VTEX/Magento no tienen profile: su capacidad se deduce de la plataforma, como siempre.
    assert directed_capability(SourcePlatform.VTEX, None) == DirectedCapability(
        supported=True, by_ean=True
    )
    assert directed_capability(SourcePlatform.MAGENTO, None) == DirectedCapability(
        supported=True, by_ean=False
    )
    assert directed_capability(SourcePlatform.AGGREGATOR, None).supported is False


# ── for_query dirigido por EAN en REST ────────────────────────────────────────────────────────
# `DirectedQuery` lleva {text, by_ean}, pero `for_query` solo recibía `query.text` → el `by_ean` se
# PERDÍA. A VTEX no le importa (su `ft=` matchea barcode y nombre con el mismo param); Bravo sí
# necesita saberlo, porque el EAN va por `filterByEan` y el texto libre no va por ningún lado.

_BRAVO_ENDPOINTS = {"profile": "bravova", "store_id": "1000", "sections": ["14", "15"]}


def _bravo_factory() -> CatalogSourceFactory:
    return CatalogSourceFactory.build(
        SourcePlatform.REST_CATALOG, "https://bravova-api.test", endpoints=_BRAVO_ENDPOINTS
    )


def test_for_query_by_ean_builds_a_directed_rest_adapter() -> None:
    source = _bravo_factory().for_query("p1", "DO", "7460083780023", by_ean=True)

    assert isinstance(source, RestCatalogAdapter)
    assert source._ean == "7460083780023", "el EAN llega al adapter → una request, sin browse"


def test_for_query_without_by_ean_keeps_the_browse_behaviour() -> None:
    # Retrocompat: el refresh amplio (Loop A) sigue navegando secciones e ignorando el texto.
    source = _bravo_factory().for_query("p1", "DO", "arroz la garza")

    assert isinstance(source, RestCatalogAdapter)
    assert source._ean is None
