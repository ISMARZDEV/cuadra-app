"""Integration — tabla `category_classification` + `taxonomy_node.embedding` (save-category-classification, Batch 1).

Requiere DB. Cubre el modelo de datos A2 (tabla dedicada de clasificación):
- Round-trip de una fila `active` (FK a store_product, canonical null).
- Invariante CHECK XOR: exactamente uno de (store_product_id, canonical_product_id) no nulo.
- Índice único parcial `WHERE status='active'`: a lo sumo UNA activa por producto.
- Columna `taxonomy_node.embedding` (Vector 1024) existe y round-trips.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from src.contexts.save.infrastructure.models import (
    CategoryClassificationModel,
    TaxonomyNodeModel,
)

from .test_product_match_repository import _seed_provider_and_canonical, _seed_store_product


def _seed_leaf(db_session, market_id: str) -> str:  # type: ignore[no-untyped-def]
    node = TaxonomyNodeModel(name="Arroz, Granos & Legumbres", level=1, market_id=market_id)
    db_session.add(node)
    db_session.flush()
    return str(node.id)


def test_roundtrip_active_classification(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, _cid = _seed_provider_and_canonical(db_session, market_id=market)
    sp_id = _seed_store_product(db_session, pid)
    leaf_id = _seed_leaf(db_session, market)

    row = CategoryClassificationModel(
        store_product_id=uuid.UUID(sp_id),
        canonical_product_id=None,
        taxonomy_node_id=uuid.UUID(leaf_id),
        confidence=Decimal("0.9500"),
        method="lexicon",
        status="active",
    )
    db_session.add(row)
    db_session.flush()

    got = db_session.get(CategoryClassificationModel, row.id)
    assert got is not None
    assert str(got.store_product_id) == sp_id
    assert got.canonical_product_id is None
    assert str(got.taxonomy_node_id) == leaf_id
    assert got.method == "lexicon"
    assert got.status == "active"


def test_check_xor_rejects_both_fk_null(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    leaf_id = _seed_leaf(db_session, market)
    row = CategoryClassificationModel(
        store_product_id=None,
        canonical_product_id=None,  # AMBOS nulos → viola el CHECK XOR
        taxonomy_node_id=uuid.UUID(leaf_id),
        confidence=Decimal("0.5000"),
        method="hybrid",
        status="active",
    )
    db_session.add(row)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_partial_unique_rejects_two_active_same_store_product(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, _cid = _seed_provider_and_canonical(db_session, market_id=market)
    sp_id = _seed_store_product(db_session, pid)
    leaf_id = _seed_leaf(db_session, market)

    def _row(status: str) -> CategoryClassificationModel:
        return CategoryClassificationModel(
            store_product_id=uuid.UUID(sp_id),
            canonical_product_id=None,
            taxonomy_node_id=uuid.UUID(leaf_id),
            confidence=Decimal("0.9000"),
            method="lexicon",
            status=status,
        )

    db_session.add(_row("active"))
    db_session.flush()
    db_session.add(_row("active"))  # segunda ACTIVA para el mismo store_product → viola único parcial
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_partial_unique_allows_superseded_plus_active(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, _cid = _seed_provider_and_canonical(db_session, market_id=market)
    sp_id = _seed_store_product(db_session, pid)
    leaf_id = _seed_leaf(db_session, market)

    def _row(status: str) -> CategoryClassificationModel:
        return CategoryClassificationModel(
            store_product_id=uuid.UUID(sp_id),
            canonical_product_id=None,
            taxonomy_node_id=uuid.UUID(leaf_id),
            confidence=Decimal("0.9000"),
            method="lexicon",
            status=status,
        )

    db_session.add(_row("superseded"))
    db_session.add(_row("active"))
    db_session.flush()  # una superseded + una active NO viola el índice parcial


def test_taxonomy_node_embedding_roundtrips(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    node = TaxonomyNodeModel(name="Despensa & Abarrotes", level=0, market_id=market)
    db_session.add(node)
    db_session.flush()

    vec = [0.0] * 1024
    vec[3] = 1.0
    node.embedding = vec
    db_session.flush()

    got = db_session.get(TaxonomyNodeModel, node.id)
    assert got is not None
    assert got.embedding is not None
    assert len(list(got.embedding)) == 1024
