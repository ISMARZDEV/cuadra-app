"""Backfill idempotente: rellena la marca de los `store_product` que no la tienen, reconociéndola
dentro del nombre contra el catálogo de marcas que ya conocemos.

Ni Magento (Nacional/Jumbo) ni Bravo publican marca — verificado en vivo el 2026-07-30 — así que
sus productos quedaron con `brand` vacío. La ingesta YA la resuelve para las observaciones nuevas
(`ResolveBrand`, enganchado en `RefreshCatalogPrices`); esto es sólo para la data vieja, que si no
tendría que esperar a una corrida completa de todas las tiendas.

RECONOCE, NO INVENTA: sólo acepta marcas que ya existen en `save.brand`. Idempotente — re-correrlo
no cambia nada, porque nunca pisa una marca ya presente. La cobertura MEJORA con el tiempo: cada
marca nueva que entra al catálogo hace que la siguiente corrida reconozca más productos.

Uso:  cd apps/api && uv run python -m seeds.backfill_brands  [--dry-run]
"""
from __future__ import annotations

import sys

from sqlalchemy import select

from src.contexts.save.domain.brand_from_name import build_brand_index, match_brand
from src.contexts.save.infrastructure.models import BrandModel, ProviderModel, StoreProductModel


def run(session, *, execute: bool) -> tuple[int, int, dict[str, int]]:
    """Devuelve (candidatos sin marca, rellenados, desglose por proveedor)."""
    # Proveedores e índices por MERCADO se cargan de una vez: resolverlos por producto sería un
    # N+1 sobre toda la tabla. Una marca de RD no debe reconocerse en el catálogo de otro país.
    providers = {
        p.id: (p.name, p.market_id) for p in session.execute(select(ProviderModel)).scalars()
    }
    indexes = {
        market_id: build_brand_index(
            session.execute(
                select(BrandModel.name).where(BrandModel.market_id == market_id)
            ).scalars().all()
        )
        for market_id in {market for _, market in providers.values()}
    }

    sin_marca = rellenados = 0
    por_proveedor: dict[str, int] = {}

    for sp in session.execute(select(StoreProductModel)).scalars():
        if sp.brand and sp.brand.strip():
            continue  # nunca se pisa una marca ya conocida
        sin_marca += 1
        provider = providers.get(sp.provider_id)
        if provider is None:
            continue
        hit = match_brand(sp.name or "", indexes.get(provider[1], {}))
        if not hit:
            continue
        rellenados += 1
        por_proveedor[provider[0]] = por_proveedor.get(provider[0], 0) + 1
        if execute:
            sp.brand = hit

    return sin_marca, rellenados, por_proveedor


def main() -> None:
    execute = "--dry-run" not in sys.argv
    from src.shared.db.base import SessionLocal

    with SessionLocal() as session:
        sin_marca, rellenados, por_proveedor = run(session, execute=execute)
        if execute:
            session.commit()

    modo = "APLICADO" if execute else "DRY-RUN (nada escrito)"
    print(f"[{modo}] store_products sin marca: {sin_marca} → rellenados: {rellenados}")
    for proveedor, n in sorted(por_proveedor.items(), key=lambda kv: -kv[1]):
        print(f"  {proveedor:14} {n}")


if __name__ == "__main__":
    main()
