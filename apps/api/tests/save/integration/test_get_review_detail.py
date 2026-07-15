"""Integration — GetReviewDetail (F2 · B1, tareas 1.19-1.20). Requiere DB.

Cubre el detalle de revisión (design §Backend Interfaces): atributos crudos del `store_product`
(name/brand/size_text/image_url, F2·B1 1.9-1.10) + candidatos `review_candidate` persistidos
(1.11-1.12), para el diff field-by-field de la UI de comparación. Una fila LEGACY (persistida
antes del wiring de candidatos, batch 1c) devuelve lista de candidatos VACÍA, nunca un error.
"""
from __future__ import annotations

import uuid

from src.contexts.save.application.get_review_detail import GetReviewDetail
from src.contexts.save.domain.entities import MatchCandidateSnapshot
from src.contexts.save.infrastructure.matching.repository.product_match_repository import (
    SqlProductMatchRepository,
)
from src.contexts.save.infrastructure.models import CanonicalProductModel, StoreProductModel
from src.contexts.save.infrastructure.repositories import SqlStoreProductRepository

from .test_product_match_repository import _seed_provider_and_canonical, _seed_store_product


def _make_use_case(db_session) -> GetReviewDetail:  # type: ignore[no-untyped-def]
    return GetReviewDetail(
        match_repo=SqlProductMatchRepository(db_session),
        store_repo=SqlStoreProductRepository(db_session),
    )


def test_returns_raw_attrs_and_candidates(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, _cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid)
    sp_row = db_session.get(StoreProductModel, uuid.UUID(sp_id))
    sp_row.name = "Arroz Selecto 10lb"
    sp_row.brand = "La Garza"
    sp_row.size_text = "10 LB"
    sp_row.image_url = "https://example.com/arroz.png"
    sp_row.ean = "7460100000123"
    sp_row.url = "https://sirena.do/arroz-selecto-10lb/p"
    db_session.flush()
    sku = sp_row.external_id  # SKU en la tienda (idempotencia)
    match_repo = SqlProductMatchRepository(db_session)
    match_id = match_repo.record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=0.4, method="human", status="pending_review",
    )
    _p1, cid_1 = _seed_provider_and_canonical(db_session, name="Arroz La Garza 10lb")
    _p2, cid_2 = _seed_provider_and_canonical(db_session, name="Arroz Diferente")
    # El candidato TOP trae imagen + tamaño desde su canonical_product (join en list_candidates);
    # el segundo NO los tiene seteados → deben salir None, nunca reventar.
    c1 = db_session.get(CanonicalProductModel, uuid.UUID(cid_1))
    c1.image_url = "https://example.com/garza.png"
    c1.display_size = "10 LB"
    db_session.flush()
    match_repo.record_candidates(
        match_id,
        [
            MatchCandidateSnapshot(canonical_product_id=cid_1, score=0.72, name="Arroz La Garza 10lb", brand="La Garza"),
            MatchCandidateSnapshot(canonical_product_id=cid_2, score=0.40, name="Arroz Diferente", brand="Otra Marca"),
        ],
    )

    detail = _make_use_case(db_session).execute(match_id)

    assert detail is not None
    assert detail.match_id == match_id
    assert detail.store_product_id == sp_id
    assert detail.store_product_name == "Arroz Selecto 10lb"
    assert detail.store_product_brand == "La Garza"
    assert detail.store_product_size_text == "10 LB"
    assert detail.store_product_image_url == "https://example.com/arroz.png"
    # Nuevos atributos del store_product (rediseño full-stack): SKU, EAN y tienda origen.
    assert detail.store_product_sku == sku
    assert detail.store_product_ean == "7460100000123"
    assert detail.store_product_url == "https://sirena.do/arroz-selecto-10lb/p"
    assert detail.provider_name == "Sirena"
    assert len(detail.candidates) == 2
    assert detail.candidates[0].canonical_product_id == cid_1  # mejor score primero
    assert detail.candidates[0].score == 0.72
    # Candidato TOP: imagen + tamaño reales desde el canonical_product.
    assert detail.candidates[0].image_url == "https://example.com/garza.png"
    assert detail.candidates[0].size_text == "10 LB"
    assert detail.candidates[1].canonical_product_id == cid_2
    assert detail.candidates[1].image_url is None
    assert detail.candidates[1].size_text is None


def test_legacy_row_with_no_candidates_returns_empty_list_not_error(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, _cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid)
    match_repo = SqlProductMatchRepository(db_session)
    match_id = match_repo.record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=0.2, method="human", status="pending_review",
    )
    # NUNCA se llamó record_candidates para este match (simula una fila legacy pre-batch-1c).

    detail = _make_use_case(db_session).execute(match_id)

    assert detail is not None
    assert detail.candidates == []


def test_returns_none_for_missing_match_id(db_session) -> None:  # type: ignore[no-untyped-def]
    detail = _make_use_case(db_session).execute(str(uuid.uuid4()))

    assert detail is None
