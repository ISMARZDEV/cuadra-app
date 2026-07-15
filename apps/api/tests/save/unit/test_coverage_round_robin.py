"""Unit — `round_robin_by_store` (F3.3, PURO): reparte la carga entre tiendas.

Patrón SRD `scrape-many.ts:11-77`: en vez de martillar UNA tienda con todos sus pares seguidos,
intercala una ronda por tienda. Preserva el orden relativo dentro de cada tienda.
"""
from __future__ import annotations

from src.contexts.save.domain.coverage import CoveragePair, round_robin_by_store


def test_interleaves_pairs_across_stores() -> None:
    # A,A,B → A,B,A (no se martilla A dos veces seguidas)
    pairs = [CoveragePair("c1", "A"), CoveragePair("c2", "A"), CoveragePair("c3", "B")]

    out = round_robin_by_store(pairs)

    assert [p.provider_id for p in out] == ["A", "B", "A"]


def test_preserves_within_store_order() -> None:
    pairs = [CoveragePair("c1", "A"), CoveragePair("c2", "A")]

    out = round_robin_by_store(pairs)

    assert [p.canonical_product_id for p in out] == ["c1", "c2"]


def test_single_store_is_unchanged() -> None:
    pairs = [CoveragePair("c1", "A"), CoveragePair("c2", "A")]

    assert round_robin_by_store(pairs) == pairs


def test_empty_is_empty() -> None:
    assert round_robin_by_store([]) == []


def test_uneven_groups_drain_after_the_short_ones() -> None:
    # A:3, B:1 → A,B,A,A (B se agota en la primera ronda; A sigue drenando)
    pairs = [
        CoveragePair("a1", "A"),
        CoveragePair("a2", "A"),
        CoveragePair("a3", "A"),
        CoveragePair("b1", "B"),
    ]

    out = round_robin_by_store(pairs)

    assert [(p.canonical_product_id, p.provider_id) for p in out] == [
        ("a1", "A"),
        ("b1", "B"),
        ("a2", "A"),
        ("a3", "A"),
    ]
