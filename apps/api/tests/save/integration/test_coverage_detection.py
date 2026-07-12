"""Integration — detección de cobertura de Loop B (F3.1). Requiere DB.

`list_uncovered(market)` devuelve los pares (canónico × tienda) que NO tienen `store_product` — lo
que Loop B tiene que ir a cubrir. Tu modelo: "si ya está vinculado, continúa; si no, hay que
buscarlo". Solo tiendas tipo supermercado del mercado.
"""
from __future__ import annotations

import uuid

from src.contexts.save.domain.entities import Provider, ProviderType, SourcePlatform
from src.contexts.save.infrastructure.repositories import (
    SqlProviderRepository,
    SqlStoreProductRepository,
)

from .test_product_match_repository import _seed_provider_and_canonical, _seed_store_product


def test_list_uncovered_returns_canonical_store_pairs_without_store_product(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid_a, cid = _seed_provider_and_canonical(db_session, market_id=market)
    # Segunda tienda del MISMO mercado, sin store_product para este canónico.
    pid_b = str(uuid.uuid4())
    SqlProviderRepository(db_session).add(
        Provider(pid_b, "Nacional", ProviderType.SUPERMARKET, SourcePlatform.MAGENTO, market)
    )
    _seed_store_product(db_session, pid_a, cid)  # el canónico YA está cubierto en la tienda A

    repo = SqlStoreProductRepository(db_session)
    pairs = repo.list_uncovered(market)

    pair_set = {(p.canonical_product_id, p.provider_id) for p in pairs}
    assert (cid, pid_b) in pair_set  # falta cubrir el canónico en la tienda B
    assert (cid, pid_a) not in pair_set  # A ya está cubierta → no aparece
