"""Refresh de precios vivos de Save: `python -m seeds.save_refresh` (o `make save-refresh`).

Wiring de los providers con fuente API verificada (doc 09) → su adapter por plataforma:
Sirena=VTEX · Nacional=Magento (store default) · Jumbo=Magento (header `Store: jumbo`, misma
instancia CCN). Corre `RefreshCatalogPrices` por fuente: refresca SOLO productos ya matcheados
(llave natural provider+external_id); lo desconocido lo resolverá el matching (F2). Las queries
son la canasta curada (scoping por canasta, doc 02 — no full-catalog). Interino hasta Dagster.
"""
from __future__ import annotations

from src.contexts.save.application.refresh_prices import RefreshCatalogPrices
from src.contexts.save.domain.ports import CatalogSource
from src.contexts.save.infrastructure.catalog_sources.magento_adapter import MagentoAdapter
from src.contexts.save.infrastructure.catalog_sources.vtex_adapter import VtexAdapter
from src.contexts.save.infrastructure.repositories import SqlStoreProductRepository

from seeds.save_seed import _provider_id

# canasta curada: una query por producto/categoría semilla (se amplía con la canasta)
_BASKET_QUERIES = ["arroz la garza"]


def _sources() -> list[tuple[str, CatalogSource]]:
    wiring: list[tuple[str, CatalogSource]] = []
    for query in _BASKET_QUERIES:
        wiring += [
            (
                "Sirena",
                VtexAdapter(
                    base_url="https://www.sirena.do",
                    provider_id=str(_provider_id("Sirena")),
                    market_id="DO",
                    query=query,
                ),
            ),
            (
                "Nacional",
                MagentoAdapter(
                    base_url="https://supermercadosnacional.com",
                    provider_id=str(_provider_id("Nacional")),
                    market_id="DO",
                    query=query,
                ),
            ),
            (
                "Jumbo",
                MagentoAdapter(
                    base_url="https://jumbo.com.do",
                    provider_id=str(_provider_id("Jumbo")),
                    market_id="DO",
                    query=query,
                    store_code="jumbo",  # misma instancia CCN; el header elige el store view
                ),
            ),
        ]
    return wiring


def main() -> None:
    from src.shared.db.base import SessionLocal

    with SessionLocal() as session:
        use_case = RefreshCatalogPrices(SqlStoreProductRepository(session))
        for name, source in _sources():
            result = use_case.execute(source)
            print(
                f"save-refresh {name}: seen={result.seen} "
                f"refreshed={result.refreshed} unmatched={result.unmatched}"
            )
        session.commit()
    print("save-refresh: OK (change-only; unmatched → matching F2).")


if __name__ == "__main__":
    main()
