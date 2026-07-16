"""Integration — detección de cobertura de Loop B (F3.1). Requiere DB.

`list_uncovered(market)` devuelve los pares (canónico × tienda) que Loop B tiene que ir a cubrir:
los que NO tienen `store_product`. Tu modelo: "si ya está vinculado, continúa; si no, hay que
buscarlo". Solo tiendas tipo supermercado del mercado.

R5 (2026-07-16) suma la otra mitad de la condición: **solo los canónicos ALCANZABLES POR BARCODE**.
Ver el bloque del final.
"""
from __future__ import annotations

import uuid

from src.contexts.save.domain.entities import Provider, ProviderType, SourcePlatform
from src.contexts.save.infrastructure.repositories import (
    SqlProviderRepository,
    SqlStoreProductRepository,
)

from .test_product_match_repository import _seed_provider_and_canonical, _seed_store_product

_EAN = "07460083780146"


def _second_store(db_session, market: str) -> str:  # type: ignore[no-untyped-def]
    pid = str(uuid.uuid4())
    SqlProviderRepository(db_session).add(
        Provider(pid, "Nacional", ProviderType.SUPERMARKET, SourcePlatform.MAGENTO, market)
    )
    return pid


def test_list_uncovered_returns_canonical_store_pairs_without_store_product(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid_a, cid = _seed_provider_and_canonical(db_session, market_id=market)
    pid_b = _second_store(db_session, market)
    # El canónico YA está cubierto en la tienda A, y esa presencia le da un barcode conocido.
    _seed_store_product(db_session, pid_a, cid, ean=_EAN)

    pairs = SqlStoreProductRepository(db_session).list_uncovered(market)

    pair_set = {(p.canonical_product_id, p.provider_id) for p in pairs}
    assert (cid, pid_b) in pair_set  # falta cubrir el canónico en la tienda B
    assert (cid, pid_a) not in pair_set  # A ya está cubierta → no aparece


# ── R5: solo los canónicos ALCANZABLES POR BARCODE ────────────────────────────────────────────
# El Proceso 2 identifica POR barcode: le pregunta a la tienda "¿tenés el artículo con el código X?".
# Un canónico del que NO conocemos ningún barcode no tiene X que preguntar — no hay consulta posible.
#
# Antes se listaba igual, y el use-case lo descartaba más adentro (R4). Filtrarlo acá evita construir
# el par y hacer la request: son requests inútiles contra APIs de terceros, que es exactamente la
# carga que no queremos externalizar.
#
# "Alcanzable por barcode" NO es una columna del canónico: `canonical_product` no tiene `ean`. Es
# derivado — significa "algún store_product ligado a él tiene barcode". En cuanto Sirena (que expone
# el 100%) lo descubre y matchea, el canónico se vuelve alcanzable y el job por EAN de Bravo empieza
# a servirle (R7: descubrir es flexible, sembrar-EAN es jerárquico).


def test_a_canonical_no_store_has_a_barcode_for_is_not_worth_asking_about(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid_a, cid = _seed_provider_and_canonical(db_session, market_id=market)
    _second_store(db_session, market)
    _seed_store_product(db_session, pid_a, cid, ean=None)  # cubierto, pero sin barcode

    pairs = SqlStoreProductRepository(db_session).list_uncovered(market)

    assert not [p for p in pairs if p.canonical_product_id == cid], (
        "un canónico sin barcode conocido no tiene consulta posible en el Proceso 2"
    )


def test_one_store_with_a_barcode_makes_the_canonical_reachable_everywhere(db_session) -> None:  # type: ignore[no-untyped-def]
    # El mecanismo store↔store: el barcode vive en el `store_product`, y el canónico es el hub. Basta
    # que UNA tienda lo aporte para que las demás puedan ser consultadas por él.
    market = f"T{uuid.uuid4().hex[:6]}"
    pid_a, cid = _seed_provider_and_canonical(db_session, market_id=market)
    pid_b = _second_store(db_session, market)
    _seed_store_product(db_session, pid_a, cid, ean=None)   # A lo tiene, sin barcode
    _seed_store_product(db_session, pid_a, cid, ean=_EAN)   # …y otra presencia SÍ lo aporta

    pairs = SqlStoreProductRepository(db_session).list_uncovered(market)

    assert (cid, pid_b) in {(p.canonical_product_id, p.provider_id) for p in pairs}
