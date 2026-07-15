"""Integration — SqlProductMatchRepository (F2.0 matching cascade). Requiere DB (`make db-up`).

Prueba lo CLAVE del repo (infra, ADR 31 — sin lógica de negocio, eso vive en la cascada Batch 7):
- `record_match` hace round-trip (auto_linked con canonical_product_id, pending_review con NULL)
  y es IDEMPOTENTE (UNIQUE(store_product_id) → upsert, nunca duplica).
- `find_candidates_trgm`/`find_candidates_vector` devuelven `MatchCandidate` rankeados
  mejor-primero (score descendente), respetan `market_id` y `limit`.
- `list_review_queue` filtra por mercado (vía provider, product_match no tiene market_id propio)
  y solo trae `pending_review` (cobertura de filtros/orden/paginación en
  `test_list_review_queue.py`, a nivel del use case `ListReviewQueue`, F2·B1).
- `resolve_review` flipea status→auto_linked (o rejected si canonical_product_id es None) y
  setea decided_by/decided_at.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import func, select

from src.contexts.save.domain.entities import (
    CanonicalProduct,
    MatchCandidateSnapshot,
    Provider,
    ProviderType,
    SourcePlatform,
)
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure
from src.contexts.save.infrastructure.matching.repository.product_match_repository import (
    SqlProductMatchRepository,
)
from src.contexts.save.infrastructure.models import (
    CanonicalProductModel,
    ProductMatchModel,
    ReviewCandidateModel,
    StoreProductModel,
    TaxonomyNodeModel,
)
from src.contexts.save.infrastructure.repositories import (
    SqlCanonicalProductRepository,
    SqlProviderRepository,
    SqlStoreProductRepository,
)


def _uuid() -> str:
    return str(uuid.uuid4())


def _seed_provider_and_canonical(
    db_session, market_id: str = "DO", name: str = "Arroz La Garza", logo_url: str | None = None
) -> tuple[str, str]:  # type: ignore[no-untyped-def]
    prov = SqlProviderRepository(db_session)
    pid = _uuid()
    prov.add(
        Provider(
            pid, "Sirena", ProviderType.SUPERMARKET, SourcePlatform.VTEX, market_id,
            logo_url=logo_url,
        )
    )
    node = TaxonomyNodeModel(name="Arroz", level=0, market_id=market_id)
    db_session.add(node)
    db_session.flush()
    crepo = SqlCanonicalProductRepository(db_session)
    cid = _uuid()
    crepo.add(
        CanonicalProduct(
            cid, name, "La Garza",
            Quantity(Decimal("4.5359237"), UnitMeasure.MASS),
            taxonomy_node_id=str(node.id), market_id=market_id,
        )
    )
    return pid, cid


def _seed_store_product(
    db_session, provider_id: str, canonical_product_id: str | None = None
) -> str:  # type: ignore[no-untyped-def]
    sp = StoreProductModel(
        provider_id=uuid.UUID(provider_id),
        canonical_product_id=uuid.UUID(canonical_product_id) if canonical_product_id else None,
        external_id=f"sku-{uuid.uuid4().hex[:8]}",
        current_price_minor=42400,
        currency="DOP",
    )
    db_session.add(sp)
    db_session.flush()
    return str(sp.id)


def _set_embedding(db_session, canonical_product_id: str, vec: list[float]) -> None:  # type: ignore[no-untyped-def]
    m = db_session.get(CanonicalProductModel, uuid.UUID(canonical_product_id))
    assert m is not None
    m.embedding = vec
    db_session.flush()


def _embedding(active: dict[int, float]) -> list[float]:
    vec = [0.0] * 1024
    for idx, val in active.items():
        vec[idx] = val
    return vec


# ---------------------------------------------------------------- record_match ----------


def test_record_match_round_trips_auto_linked(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid, canonical_product_id=cid)
    repo = SqlProductMatchRepository(db_session)

    match_id = repo.record_match(
        store_product_id=sp_id, canonical_product_id=cid,
        confidence=0.97, method="ean", status="auto_linked",
    )

    row = db_session.get(ProductMatchModel, uuid.UUID(match_id))
    assert row is not None
    assert str(row.store_product_id) == sp_id
    assert str(row.canonical_product_id) == cid
    assert row.method == "ean"
    assert row.status == "auto_linked"
    assert float(row.confidence) == 0.97


def test_record_match_round_trips_pending_review_without_canonical(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, _cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid)
    repo = SqlProductMatchRepository(db_session)

    match_id = repo.record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=0.4, method="human", status="pending_review",
    )

    row = db_session.get(ProductMatchModel, uuid.UUID(match_id))
    assert row is not None
    assert row.canonical_product_id is None
    assert row.status == "pending_review"
    assert row.method == "human"


def test_record_match_is_idempotent_no_duplicate_pending_entry(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid)
    repo = SqlProductMatchRepository(db_session)

    first_id = repo.record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=0.4, method="trgm", status="pending_review",
    )
    second_id = repo.record_match(
        store_product_id=sp_id, canonical_product_id=cid,
        confidence=0.9, method="vector", status="auto_linked",
    )

    assert first_id == second_id  # upsert: mismo id, no fila nueva
    rows = db_session.scalars(
        select(ProductMatchModel).where(ProductMatchModel.store_product_id == uuid.UUID(sp_id))
    ).all()
    assert len(rows) == 1
    assert rows[0].status == "auto_linked"
    assert str(rows[0].canonical_product_id) == cid


def test_record_candidates_is_idempotent_on_reruns(db_session) -> None:  # type: ignore[no-untyped-def]
    """Regresión: la cascada re-corre sobre un store_product YA en revisión (record_match upsertea →
    MISMO match_id). `record_candidates` debe REEMPLAZAR el set de candidatos, no re-insertar — antes
    reventaba con UniqueViolation en `uq_review_candidate_match_canonical` (el crash de la ingesta de
    Bravo que se veía como 'cuelgue': la transacción abortaba)."""
    pid, cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid)
    repo = SqlProductMatchRepository(db_session)
    snap = MatchCandidateSnapshot(canonical_product_id=cid, score=0.62, name="Arroz La Garza", brand="La Garza")

    match_id = repo.record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=0.62, method="human", status="pending_review",
    )
    repo.record_candidates(match_id, [snap])

    # Segunda corrida: record_match REUSA el match (upsert) → record_candidates NO debe reventar.
    match_id_2 = repo.record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=0.62, method="human", status="pending_review",
    )
    assert match_id_2 == match_id
    repo.record_candidates(match_id_2, [snap])  # antes: IntegrityError (uq)

    n = db_session.scalar(
        select(func.count())
        .select_from(ReviewCandidateModel)
        .where(ReviewCandidateModel.product_match_id == uuid.UUID(match_id))
    )
    assert n == 1  # reemplazado, no duplicado


def test_record_candidates_dedups_same_canonical_within_batch(db_session) -> None:  # type: ignore[no-untyped-def]
    """El mismo canónico puede llegar por >1 etapa (EAN/trgm/pgvector); el set final tiene UNA fila por
    canónico (el de mejor score), sin violar `uq_review_candidate_match_canonical`."""
    pid, cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid)
    repo = SqlProductMatchRepository(db_session)
    match_id = repo.record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=0.5, method="human", status="pending_review",
    )

    repo.record_candidates(
        match_id,
        [
            MatchCandidateSnapshot(canonical_product_id=cid, score=0.40, name="Arroz", brand="La Garza"),
            MatchCandidateSnapshot(canonical_product_id=cid, score=0.71, name="Arroz", brand="La Garza"),
        ],
    )

    rows = db_session.scalars(
        select(ReviewCandidateModel).where(ReviewCandidateModel.product_match_id == uuid.UUID(match_id))
    ).all()
    assert len(rows) == 1
    assert float(rows[0].score) == 0.71  # se conserva el mejor score


# ---------------------------------------------------------------- find_candidates_trgm ----------


def test_find_candidates_trgm_ranks_by_similarity_and_excludes_unrelated(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    _pid1, cid_exact = _seed_provider_and_canonical(
        db_session, market_id=market, name="Arroz La Garza 5kg"
    )
    _pid2, cid_close = _seed_provider_and_canonical(
        db_session, market_id=market, name="Arroz La Garza 5 kg Premium"
    )
    _pid3, cid_far = _seed_provider_and_canonical(
        db_session, market_id=market, name="Detergente Ariel Concentrado 1L"
    )

    repo = SqlProductMatchRepository(db_session)
    candidates = repo.find_candidates_trgm("Arroz La Garza 5kg", market, limit=20)

    ids = [c.canonical_product_id for c in candidates]
    assert cid_exact in ids
    assert cid_close in ids
    assert cid_far not in ids  # sin relación léxica → bajo el threshold de pg_trgm
    assert ids.index(cid_exact) < ids.index(cid_close)  # match exacto rankea primero
    assert candidates[0].score >= candidates[1].score  # orden descendente por score


def test_find_candidates_trgm_respects_limit(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    for i in range(5):
        _seed_provider_and_canonical(db_session, market_id=market, name=f"Arroz La Garza variante {i}")
    repo = SqlProductMatchRepository(db_session)

    candidates = repo.find_candidates_trgm("Arroz La Garza", market, limit=2)

    assert len(candidates) <= 2


# ---------------------------------------------------------------- find_candidates_vector ----------


def test_find_candidates_vector_ranks_nearest_first(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    _p1, cid_a = _seed_provider_and_canonical(db_session, market_id=market, name="Producto A")
    _p2, cid_b = _seed_provider_and_canonical(db_session, market_id=market, name="Producto B")
    _p3, cid_c = _seed_provider_and_canonical(db_session, market_id=market, name="Producto C")

    _set_embedding(db_session, cid_a, _embedding({0: 1.0}))            # idéntico a la query
    _set_embedding(db_session, cid_b, _embedding({0: 0.9, 1: 0.1}))    # cercano
    _set_embedding(db_session, cid_c, _embedding({500: 1.0}))          # ortogonal (lejano)

    repo = SqlProductMatchRepository(db_session)
    candidates = repo.find_candidates_vector(_embedding({0: 1.0}), market, limit=20)

    ids = [c.canonical_product_id for c in candidates]
    assert ids == [cid_a, cid_b, cid_c]
    assert candidates[0].score > candidates[1].score > candidates[2].score


def test_find_candidates_vector_respects_market_and_limit(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    other_market = f"T{uuid.uuid4().hex[:6]}"
    _p1, cid_in = _seed_provider_and_canonical(db_session, market_id=market, name="Producto In")
    _p2, cid_out = _seed_provider_and_canonical(db_session, market_id=other_market, name="Producto Out")
    _set_embedding(db_session, cid_in, _embedding({0: 1.0}))
    _set_embedding(db_session, cid_out, _embedding({0: 1.0}))

    repo = SqlProductMatchRepository(db_session)
    candidates = repo.find_candidates_vector(_embedding({0: 1.0}), market, limit=1)

    ids = [c.canonical_product_id for c in candidates]
    assert cid_in in ids
    assert cid_out not in ids  # otro mercado no debe aparecer
    assert len(candidates) == 1  # respeta el limit


# ---------------------------------------------------------------- list_review_queue ----------


def test_list_review_queue_returns_only_pending_entries(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, cid = _seed_provider_and_canonical(db_session, market_id=market)
    sp_pending = _seed_store_product(db_session, pid)
    sp_linked = _seed_store_product(db_session, pid, canonical_product_id=cid)

    repo = SqlProductMatchRepository(db_session)
    repo.record_match(
        store_product_id=sp_pending, canonical_product_id=None,
        confidence=0.4, method="human", status="pending_review",
    )
    repo.record_match(
        store_product_id=sp_linked, canonical_product_id=cid,
        confidence=0.99, method="ean", status="auto_linked",
    )

    rows, total = repo.list_review_queue(market)

    assert [r.store_product_id for r in rows] == [sp_pending]
    assert total == 1


def test_list_review_queue_isolated_by_market(db_session) -> None:  # type: ignore[no-untyped-def]
    market_a = f"T{uuid.uuid4().hex[:6]}"
    market_b = f"T{uuid.uuid4().hex[:6]}"
    pid_a, _cid_a = _seed_provider_and_canonical(db_session, market_id=market_a)
    sp_a = _seed_store_product(db_session, pid_a)
    repo = SqlProductMatchRepository(db_session)
    repo.record_match(
        store_product_id=sp_a, canonical_product_id=None,
        confidence=0.3, method="human", status="pending_review",
    )

    rows, total = repo.list_review_queue(market_b)
    assert rows == []
    assert total == 0


# ---------------------------------------------------------------- resolve_review ----------


def test_resolve_review_links_and_sets_decided_metadata(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid)
    repo = SqlProductMatchRepository(db_session)
    match_id = repo.record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=0.4, method="human", status="pending_review",
    )

    repo.resolve_review(match_id, cid, decided_by="admin-123")

    row = db_session.get(ProductMatchModel, uuid.UUID(match_id))
    assert row is not None
    assert row.status == "auto_linked"
    assert str(row.canonical_product_id) == cid
    assert row.decided_by == "admin-123"
    assert row.decided_at is not None


def test_resolve_review_rejects_when_canonical_is_none(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, _cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid)
    repo = SqlProductMatchRepository(db_session)
    match_id = repo.record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=0.2, method="human", status="pending_review",
    )

    repo.resolve_review(match_id, None, decided_by="admin-123")

    row = db_session.get(ProductMatchModel, uuid.UUID(match_id))
    assert row is not None
    assert row.status == "rejected"
    assert row.canonical_product_id is None
    assert row.decided_by == "admin-123"


# ---------------------------------------------------------------- find_candidates_by_ean ----------


def _seed_linked_store_product_with_ean(
    db_session, provider_id: str, canonical_product_id: str, ean: str
) -> str:  # type: ignore[no-untyped-def]
    sp = StoreProductModel(
        provider_id=uuid.UUID(provider_id),
        canonical_product_id=uuid.UUID(canonical_product_id),
        external_id=f"sku-{uuid.uuid4().hex[:8]}",
        current_price_minor=42400,
        currency="DOP",
        ean=ean,
    )
    db_session.add(sp)
    db_session.flush()
    return str(sp.id)


def test_find_candidates_by_ean_returns_linked_canonical(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, cid = _seed_provider_and_canonical(db_session, market_id=market)
    _seed_linked_store_product_with_ean(db_session, pid, cid, ean="7501000000001")
    repo = SqlProductMatchRepository(db_session)

    candidates = repo.find_candidates_by_ean("7501000000001", market)

    assert [c.canonical_product_id for c in candidates] == [cid]
    assert candidates[0].score == 1.0  # EAN exacto


def test_find_candidates_by_ean_empty_when_no_match(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, cid = _seed_provider_and_canonical(db_session, market_id=market)
    _seed_linked_store_product_with_ean(db_session, pid, cid, ean="7501000000001")
    repo = SqlProductMatchRepository(db_session)

    assert repo.find_candidates_by_ean("0000000000000", market) == []


def test_find_candidates_by_ean_collision_returns_distinct_canonicals(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid_a, cid_a = _seed_provider_and_canonical(db_session, market_id=market, name="Arroz A")
    pid_b, cid_b = _seed_provider_and_canonical(db_session, market_id=market, name="Arroz B")
    _seed_linked_store_product_with_ean(db_session, pid_a, cid_a, ean="dup-ean")
    _seed_linked_store_product_with_ean(db_session, pid_b, cid_b, ean="dup-ean")
    repo = SqlProductMatchRepository(db_session)

    candidates = repo.find_candidates_by_ean("dup-ean", market)

    assert {c.canonical_product_id for c in candidates} == {cid_a, cid_b}  # colisión ambigua


def test_find_candidates_by_ean_excludes_unlinked_and_other_market(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    other = f"T{uuid.uuid4().hex[:6]}"
    pid, cid = _seed_provider_and_canonical(db_session, market_id=market)
    # mismo EAN pero SIN enlazar (canonical_product_id NULL) -> no es candidato
    sp_unlinked = StoreProductModel(
        provider_id=uuid.UUID(pid),
        canonical_product_id=None,
        external_id=f"sku-{uuid.uuid4().hex[:8]}",
        current_price_minor=100,
        currency="DOP",
        ean="shared-ean",
    )
    db_session.add(sp_unlinked)
    # mismo EAN pero en OTRO mercado -> no debe aparecer
    pid_other, cid_other = _seed_provider_and_canonical(db_session, market_id=other, name="Otro")
    _seed_linked_store_product_with_ean(db_session, pid_other, cid_other, ean="shared-ean")
    db_session.flush()
    repo = SqlProductMatchRepository(db_session)

    assert repo.find_candidates_by_ean("shared-ean", market) == []


# ---------------------------------------------------------------- link_to_canonical ----------


def test_link_to_canonical_writes_denormalized_fk(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid)  # sin canonical (unmatched)
    repo = SqlStoreProductRepository(db_session)

    repo.link_to_canonical(sp_id, cid)

    row = db_session.get(StoreProductModel, uuid.UUID(sp_id))
    assert row is not None
    assert str(row.canonical_product_id) == cid


def test_link_to_canonical_overwrites_previous_link(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, cid_old = _seed_provider_and_canonical(db_session, name="Viejo")
    _pid2, cid_new = _seed_provider_and_canonical(
        db_session, market_id="DO", name="Nuevo canónico"
    )
    sp_id = _seed_store_product(db_session, pid, canonical_product_id=cid_old)
    repo = SqlStoreProductRepository(db_session)

    repo.link_to_canonical(sp_id, cid_new)

    row = db_session.get(StoreProductModel, uuid.UUID(sp_id))
    assert row is not None
    assert str(row.canonical_product_id) == cid_new
