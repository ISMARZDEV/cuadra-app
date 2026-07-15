"""Unit — la config de fuente de Bravo Va que SIEMBRA `save_seed` es válida end-to-end.

Sin DB: en vez de correr el seed (que necesita Postgres), verificamos que las constantes que el seed
persiste en el `StoreRegistry` (base_url + endpoints con profile/sections/store_id) componen de verdad
con la factory → un `RestCatalogAdapter`. Blinda que el panel de fuentes y el botón "Probar" funcionen
para Bravo Va, y que un typo en las secciones/profile rompa acá y no en runtime.
"""
from __future__ import annotations

from seeds.save_seed import BRAVO_BASE_URL, BRAVO_SOURCE_ENDPOINTS
from src.contexts.save.domain.entities import SourcePlatform
from src.contexts.save.infrastructure.catalog_sources.factory import CatalogSourceFactory
from src.contexts.save.infrastructure.catalog_sources.rest_catalog_adapter import RestCatalogAdapter


def test_bravo_seed_endpoints_build_a_rest_catalog_adapter() -> None:
    builder = CatalogSourceFactory.build(
        SourcePlatform.REST_CATALOG, BRAVO_BASE_URL, endpoints=BRAVO_SOURCE_ENDPOINTS
    )
    adapter = builder.for_query("prov-bravo", "DO", "")  # query ignorado (browse-full)

    assert isinstance(adapter, RestCatalogAdapter)


def test_bravo_seed_endpoints_shape_is_sane() -> None:
    assert BRAVO_SOURCE_ENDPOINTS["profile"] == "bravova"
    assert BRAVO_SOURCE_ENDPOINTS["store_id"] == "1000"
    sections = BRAVO_SOURCE_ENDPOINTS["sections"]
    assert sections, "debe haber al menos una sección"
    assert all(isinstance(s, str) and s.strip() for s in sections)
    # las vistas promo/meta NO se siembran (son filtros redundantes de productos ya categorizados)
    assert "1108" not in sections  # OFERTAS
    assert "1096" not in sections  # PROMOCIÓN 3X2
    assert "1098" not in sections  # Productos Nuevos
