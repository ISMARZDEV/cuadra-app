"""Wiring de fuentes de catálogo de Save — config PURA (sin red, sin dagster).

Única fuente de verdad del wiring, compartida por el runner CLI (`make save-refresh`) y por los
assets de Dagster. Un adaptador por (fuente, query de la canasta). Fuentes verificadas en vivo
(doc 09): Sirena=VTEX · Nacional/Jumbo=Magento CCN (Jumbo con header `Store: jumbo`). Scoping por
CANASTA curada (doc 02), no full-catalog. Los IDs de provider salen del seed (bridge de F1 hasta
que exista `store_registry`, doc 06).
"""
from __future__ import annotations

from src.contexts.save.domain.ports import CatalogSource
from src.contexts.save.infrastructure.catalog_sources.magento_adapter import MagentoAdapter
from src.contexts.save.infrastructure.catalog_sources.vtex_adapter import VtexAdapter

from seeds.save_seed import provider_id

SAVE_MARKET = "DO"
BASKET_QUERIES: tuple[str, ...] = ("arroz la garza",)


def build_sources(
    queries: tuple[str, ...] = BASKET_QUERIES,
) -> dict[str, list[CatalogSource]]:
    """Fuentes de catálogo por tienda: {clave: [adapter por query]}. No dispara red."""
    sirena_id = str(provider_id("Sirena"))
    nacional_id = str(provider_id("Nacional"))
    jumbo_id = str(provider_id("Jumbo"))
    return {
        "sirena": [
            VtexAdapter(
                base_url="https://www.sirena.do",
                provider_id=sirena_id,
                market_id=SAVE_MARKET,
                query=query,
            )
            for query in queries
        ],
        "nacional": [
            MagentoAdapter(
                base_url="https://supermercadosnacional.com",
                provider_id=nacional_id,
                market_id=SAVE_MARKET,
                query=query,
            )
            for query in queries
        ],
        "jumbo": [
            MagentoAdapter(
                base_url="https://jumbo.com.do",
                provider_id=jumbo_id,
                market_id=SAVE_MARKET,
                query=query,
                store_code="jumbo",  # misma instancia CCN; el header elige el store view
            )
            for query in queries
        ],
    }
