"""Integration — persistencia de `review_candidate` (F2 · B1, tareas 1.11-1.12). Requiere DB.

`SqlProductMatchRepository.record_candidates` persiste el snapshot de candidatos ofrecidos al
revisor humano para un `product_match` `pending_review`: cap top-5 EN CÓDIGO (no hay límite de
fila en la DB), ordenado por score crudo descendente (nunca el score fusionado por RRF — ver
`MatchStoreProduct._fused_snapshots`). NUNCA se llama para un match `auto_linked` — esa es una
decisión del use case (`_to_review` vs `_auto_link`, tarea 1.12), no de este repo.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select

from src.contexts.save.domain.entities import MatchCandidateSnapshot
from src.contexts.save.infrastructure.matching.repository.product_match_repository import (
    SqlProductMatchRepository,
)
from src.contexts.save.infrastructure.models import ReviewCandidateModel

from .test_product_match_repository import _seed_provider_and_canonical, _seed_store_product


def _candidates_rows(db_session, match_id: str):  # type: ignore[no-untyped-def]
    return db_session.scalars(
        select(ReviewCandidateModel).where(
            ReviewCandidateModel.product_match_id == uuid.UUID(match_id)
        )
    ).all()


def test_record_candidates_persists_top_five_ordered_by_score_desc(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, _cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid)
    repo = SqlProductMatchRepository(db_session)
    match_id = repo.record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=0.3, method="human", status="pending_review",
    )
    scores = [0.10, 0.90, 0.55, 0.72, 0.33, 0.61, 0.44]  # 7 candidatos -> más que el cap de 5
    candidates = []
    for i, score in enumerate(scores):
        _pid_i, cid_i = _seed_provider_and_canonical(db_session, name=f"Producto {i}")
        candidates.append(
            MatchCandidateSnapshot(
                canonical_product_id=cid_i, score=score, name=f"Producto {i}", brand="Marca"
            )
        )

    repo.record_candidates(match_id, candidates)

    rows = _candidates_rows(db_session, match_id)
    assert len(rows) == 5  # cap top-5 aunque llegaron 7
    persisted_scores = sorted((float(r.score) for r in rows), reverse=True)
    assert persisted_scores == sorted(scores, reverse=True)[:5]
    # el peor score (0.10) NUNCA debe sobrevivir el cap
    assert 0.10 not in persisted_scores


def test_record_candidates_persists_name_and_brand_snapshot(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, _cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid)
    repo = SqlProductMatchRepository(db_session)
    match_id = repo.record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=0.3, method="human", status="pending_review",
    )
    _pid_i, cid_i = _seed_provider_and_canonical(db_session, name="Arroz La Garza")

    repo.record_candidates(
        match_id,
        [MatchCandidateSnapshot(canonical_product_id=cid_i, score=0.72, name="Arroz La Garza", brand="La Garza")],
    )

    rows = _candidates_rows(db_session, match_id)
    assert len(rows) == 1
    assert rows[0].name == "Arroz La Garza"
    assert rows[0].brand == "La Garza"
    assert str(rows[0].canonical_product_id) == cid_i


def test_record_candidates_empty_list_persists_nothing(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, _cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid)
    repo = SqlProductMatchRepository(db_session)
    match_id = repo.record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=0.3, method="human", status="pending_review",
    )

    repo.record_candidates(match_id, [])

    assert _candidates_rows(db_session, match_id) == []


def test_auto_linked_match_has_no_review_candidates_when_none_recorded(db_session) -> None:  # type: ignore[no-untyped-def]
    # Un match auto_linked nunca tiene review_candidate porque el use case (1.12) simplemente
    # nunca llama record_candidates para ese camino — este test fija ese contrato a nivel repo.
    pid, cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid, canonical_product_id=cid)
    repo = SqlProductMatchRepository(db_session)
    match_id = repo.record_match(
        store_product_id=sp_id, canonical_product_id=cid,
        confidence=0.97, method="ean", status="auto_linked",
    )

    assert _candidates_rows(db_session, match_id) == []
