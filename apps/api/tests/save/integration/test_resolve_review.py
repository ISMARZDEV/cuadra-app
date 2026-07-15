"""Integration — ResolveReview (F2 · B1). Regresión del bug F2.0: `resolve_review` del repo NUNCA
escribía `store_product.canonical_product_id`, dejando el FK sin enlazar en el camino de
aprobación HUMANA (la cascada automática sí lo hacía vía `_auto_link`). Este use case lo corrige:
ambas escrituras — FK + product_match — comparten la misma Session/UoW, mismo patrón que
`_auto_link` (F2.0).
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from src.contexts.save.application.resolve_review import ResolveReview
from src.contexts.save.infrastructure.matching.repository.product_match_repository import (
    SqlProductMatchRepository,
)
from src.contexts.save.infrastructure.models import ProductMatchModel, StoreProductModel
from src.contexts.save.infrastructure.repositories import SqlStoreProductRepository

from .test_product_match_repository import _seed_provider_and_canonical, _seed_store_product


def _make_resolver(db_session) -> ResolveReview:  # type: ignore[no-untyped-def]
    return ResolveReview(
        match_repo=SqlProductMatchRepository(db_session),
        store_repo=SqlStoreProductRepository(db_session),
    )


def test_approve_writes_fk_and_product_match_in_one_tx(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid)  # sin canonical (unmatched)
    match_repo = SqlProductMatchRepository(db_session)
    match_id = match_repo.record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=0.4, method="llm", status="pending_review",
    )
    resolver = _make_resolver(db_session)

    resolver.execute(match_id=match_id, canonical_product_id=cid, decided_by="admin-123")

    match_row = db_session.get(ProductMatchModel, uuid.UUID(match_id))
    assert match_row is not None
    assert match_row.status == "auto_linked"
    assert str(match_row.canonical_product_id) == cid
    assert match_row.method == "human"
    assert match_row.decided_by == "admin-123"
    assert match_row.decided_at is not None
    # EL BUG: hasta ahora esto quedaba en None — el FK denormalizado nunca se escribía.
    sp_row = db_session.get(StoreProductModel, uuid.UUID(sp_id))
    assert sp_row is not None
    assert str(sp_row.canonical_product_id) == cid


def test_reject_requires_reason_code_and_changes_no_state(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, _cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid)
    match_repo = SqlProductMatchRepository(db_session)
    match_id = match_repo.record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=0.2, method="llm", status="pending_review",
    )
    resolver = _make_resolver(db_session)

    with pytest.raises(ValueError, match="reason_code"):
        resolver.execute(match_id=match_id, canonical_product_id=None, decided_by="admin-123")

    row = db_session.get(ProductMatchModel, uuid.UUID(match_id))
    assert row is not None
    assert row.status == "pending_review"  # sin cambios
    assert row.decided_by is None


def test_reject_with_reason_code_sets_rejected_and_no_fk_write(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, _cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid)
    match_repo = SqlProductMatchRepository(db_session)
    match_id = match_repo.record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=0.2, method="llm", status="pending_review",
    )
    resolver = _make_resolver(db_session)

    resolver.execute(
        match_id=match_id, canonical_product_id=None, decided_by="admin-123",
        reason_code="different_size", reason_note="500g vs 1kg",
    )

    row = db_session.get(ProductMatchModel, uuid.UUID(match_id))
    assert row is not None
    assert row.status == "rejected"
    assert row.canonical_product_id is None
    assert row.method == "human"
    assert row.reason_code == "different_size"
    assert row.reason_note == "500g vs 1kg"
    sp_row = db_session.get(StoreProductModel, uuid.UUID(sp_id))
    assert sp_row is not None
    assert sp_row.canonical_product_id is None  # nunca se tocó


def test_approve_with_nonexistent_canonical_rolls_back_both_writes(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, _cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid)
    match_repo = SqlProductMatchRepository(db_session)
    match_id = match_repo.record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=0.4, method="llm", status="pending_review",
    )
    resolver = _make_resolver(db_session)
    fake_canonical_id = str(uuid.uuid4())  # no existe -> viola el FK de store_product

    # Savepoint anidado: acota el rollback a ESTA operación, sin deshacer el seed de arriba
    # (un `db_session.rollback()` a secas deshace TODO el savepoint del fixture, seed incluido).
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            resolver.execute(
                match_id=match_id, canonical_product_id=fake_canonical_id, decided_by="admin-123"
            )

    match_row = db_session.get(ProductMatchModel, uuid.UUID(match_id))
    assert match_row is not None
    assert match_row.status == "pending_review"  # ninguna escritura persistió
    assert match_row.canonical_product_id is None
    sp_row = db_session.get(StoreProductModel, uuid.UUID(sp_id))
    assert sp_row is not None
    assert sp_row.canonical_product_id is None


def test_get_by_id_returns_none_when_missing(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = SqlProductMatchRepository(db_session)
    assert repo.get_by_id(str(uuid.uuid4())) is None
