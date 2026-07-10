"""Integration — categoría en la cola de revisión (save-category-classification, Batch 11). DB.

`list_review_queue` deja de hardcodear None: la clasificación `active` del store_product → hoja →
ancestro TOPE puebla `category_slug`/`category_name`. Sin clasificación → None (badge N/A).
"""
from __future__ import annotations

import uuid

from sqlalchemy import select

from seeds.save_taxonomy_seed import seed_taxonomy
from src.contexts.save.domain.classification import CategoryClassification
from src.contexts.save.infrastructure.matching.repository.product_match_repository import (
    SqlProductMatchRepository,
)
from src.contexts.save.infrastructure.models import TaxonomyNodeModel
from src.contexts.save.infrastructure.repositories import SqlCategoryClassificationRepository

from .test_list_review_queue import _seed_pending_match
from .test_product_match_repository import _seed_provider_and_canonical

_ENTRIES = [("Despensa & Abarrotes", ["Arroz, Granos & Legumbres"])]


def _leaf_id(db_session, market: str, name: str) -> str:  # type: ignore[no-untyped-def]
    node = db_session.scalar(
        select(TaxonomyNodeModel).where(
            TaxonomyNodeModel.market_id == market, TaxonomyNodeModel.name == name
        )
    )
    return str(node.id)


def _row_for(rows, store_product_id):  # type: ignore[no-untyped-def]
    return next(r for r in rows if r.store_product_id == store_product_id)


def test_classified_store_product_shows_top_category(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, _cid = _seed_provider_and_canonical(db_session, market_id=market)
    sp_id, _match_id = _seed_pending_match(db_session, pid, confidence=0.6)

    seed_taxonomy(db_session, market_id=market, entries=_ENTRIES)
    db_session.flush()
    leaf_id = _leaf_id(db_session, market, "Arroz, Granos & Legumbres")
    SqlCategoryClassificationRepository(db_session).save_active(
        CategoryClassification(
            id=str(uuid.uuid4()), store_product_id=sp_id, canonical_product_id=None,
            taxonomy_node_id=leaf_id, confidence=0.95, method="lexicon", status="active",
        )
    )

    rows, _total = SqlProductMatchRepository(db_session).list_review_queue(market)
    row = _row_for(rows, sp_id)
    assert row.category_name == "Despensa & Abarrotes"  # ancestro TOPE, no la hoja
    assert row.category_slug == "despensa-abarrotes"


def test_unclassified_store_product_has_none_category(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, _cid = _seed_provider_and_canonical(db_session, market_id=market)
    sp_id, _match_id = _seed_pending_match(db_session, pid, confidence=0.6)

    rows, _total = SqlProductMatchRepository(db_session).list_review_queue(market)
    row = _row_for(rows, sp_id)
    assert row.category_slug is None
    assert row.category_name is None
