"""Integration — SqlCategoryClassificationRepository (save-category-classification, Batch 4). DB.

- save_active + active_for round-trip.
- save_active 2× sobre el mismo producto → 1 sola `active`, la anterior `superseded`.
- list_unclassified excluye los que tienen `active`.
"""
from __future__ import annotations

import uuid

from sqlalchemy import func, select

from src.contexts.save.domain.classification import CategoryClassification
from src.contexts.save.infrastructure.models import CategoryClassificationModel
from src.contexts.save.infrastructure.repositories import SqlCategoryClassificationRepository

from .test_category_classification_model import _seed_leaf
from .test_product_match_repository import _seed_provider_and_canonical, _seed_store_product


def _classification(sp_id: str, leaf_id: str, method: str = "lexicon") -> CategoryClassification:
    return CategoryClassification(
        id=str(uuid.uuid4()), store_product_id=sp_id, canonical_product_id=None,
        taxonomy_node_id=leaf_id, confidence=0.95, method=method, status="active",
    )


def test_save_active_then_active_for(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, _cid = _seed_provider_and_canonical(db_session, market_id=market)
    sp_id = _seed_store_product(db_session, pid)
    leaf_id = _seed_leaf(db_session, market)
    repo = SqlCategoryClassificationRepository(db_session)

    repo.save_active(_classification(sp_id, leaf_id))

    got = repo.active_for(sp_id, is_canonical=False)
    assert got is not None
    assert got.taxonomy_node_id == leaf_id
    assert got.method == "lexicon"
    assert got.status == "active"


def test_save_active_supersedes_previous(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, _cid = _seed_provider_and_canonical(db_session, market_id=market)
    sp_id = _seed_store_product(db_session, pid)
    leaf_id = _seed_leaf(db_session, market)
    repo = SqlCategoryClassificationRepository(db_session)

    repo.save_active(_classification(sp_id, leaf_id, method="lexicon"))
    repo.save_active(_classification(sp_id, leaf_id, method="llm"))  # re-clasificar

    # exactamente una activa, y es la nueva (llm)
    active = repo.active_for(sp_id, is_canonical=False)
    assert active is not None and active.method == "llm"
    n_active = db_session.scalar(
        select(func.count()).select_from(CategoryClassificationModel).where(
            CategoryClassificationModel.store_product_id == uuid.UUID(sp_id),
            CategoryClassificationModel.status == "active",
        )
    )
    assert n_active == 1
    n_total = db_session.scalar(
        select(func.count()).select_from(CategoryClassificationModel).where(
            CategoryClassificationModel.store_product_id == uuid.UUID(sp_id)
        )
    )
    assert n_total == 2  # historial preservado (1 superseded + 1 active)


def test_list_unclassified_excludes_classified(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, _cid = _seed_provider_and_canonical(db_session, market_id=market)
    # los 3 store_product cuelgan del provider `pid`, cuyo market es `market` (join provider)
    sp_a = _seed_store_product(db_session, pid)
    sp_b = _seed_store_product(db_session, pid)
    sp_c = _seed_store_product(db_session, pid)
    leaf_id = _seed_leaf(db_session, market)
    repo = SqlCategoryClassificationRepository(db_session)

    repo.save_active(_classification(sp_a, leaf_id))  # solo A clasificado

    unclassified = repo.list_unclassified(market, is_canonical=False, limit=50)
    ids = {p.ref_id for p in unclassified}
    assert sp_a not in ids
    assert sp_b in ids and sp_c in ids
