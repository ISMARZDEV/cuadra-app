"""Integration — ListReviewQueue (F2 · B1, tareas 1.17-1.18). Requiere DB.

Cubre el contrato de la consola de administración (design §Backend Interfaces):
- Orden por DEFECTO = incertidumbre primero (distancia al umbral de decisión más cercano,
  HIGH=0.85 o MID=0.55 de `banding.py` — los candidatos más difíciles de decidir van primero).
- Override explícito `order_by="created_at"` = FIFO (orden de llegada).
- Filtros: `provider_id`, `method`, `confidence_range`.
- Paginación real (`limit`/`offset`) con `total` correcto (para el paginador de la UI).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from src.contexts.save.application.list_review_queue import ListReviewQueue
from src.contexts.save.infrastructure.matching.repository.product_match_repository import (
    SqlProductMatchRepository,
)
from src.contexts.save.infrastructure.models import ProductMatchModel

from .test_product_match_repository import _seed_provider_and_canonical, _seed_store_product


def _seed_pending_match(
    db_session, provider_id: str, confidence: float, method: str = "human",
    run_id: str | None = None,
) -> tuple[str, str]:  # type: ignore[no-untyped-def]
    sp_id = _seed_store_product(db_session, provider_id)
    repo = SqlProductMatchRepository(db_session)
    match_id = repo.record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=confidence, method=method, status="pending_review",
        run_id=run_id,
    )
    return sp_id, match_id


def _set_created_at(db_session, match_id: str, when: datetime) -> None:  # type: ignore[no-untyped-def]
    # `created_at` usa `server_default=func.now()`: dentro de UNA transacción Postgres `now()`
    # es estable (hora de inicio de tx), así que varias filas seedeadas en el mismo test caerían
    # en el MISMO timestamp. Se fija explícito para que el orden FIFO sea determinístico en test.
    row = db_session.get(ProductMatchModel, uuid.UUID(match_id))
    row.created_at = when
    db_session.flush()


def test_default_order_is_uncertainty_first(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, _cid = _seed_provider_and_canonical(db_session, market_id=market)
    # distancia al umbral más cercano: 0.53 -> 0.02 (a MID); 0.30 -> 0.25 (a MID); 0.10 -> 0.45 (a MID)
    _sp_close, m_close = _seed_pending_match(db_session, pid, confidence=0.53)
    _sp_mid, m_mid = _seed_pending_match(db_session, pid, confidence=0.30)
    _sp_far, m_far = _seed_pending_match(db_session, pid, confidence=0.10)

    use_case = ListReviewQueue(SqlProductMatchRepository(db_session))
    rows, total = use_case.execute(market, limit=50, offset=0)

    assert total == 3
    assert [r.match_id for r in rows] == [m_close, m_mid, m_far]


def test_order_by_created_at_is_fifo_override(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, _cid = _seed_provider_and_canonical(db_session, market_id=market)
    # a propósito en orden DE CONFIANZA que NO coincide con el orden de inserción, para probar
    # que created_at ignora la incertidumbre.
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    _sp1, m_first = _seed_pending_match(db_session, pid, confidence=0.53)
    _set_created_at(db_session, m_first, base)
    _sp2, m_second = _seed_pending_match(db_session, pid, confidence=0.10)
    _set_created_at(db_session, m_second, base + timedelta(seconds=1))
    _sp3, m_third = _seed_pending_match(db_session, pid, confidence=0.30)
    _set_created_at(db_session, m_third, base + timedelta(seconds=2))

    use_case = ListReviewQueue(SqlProductMatchRepository(db_session))
    rows, _total = use_case.execute(market, order_by="created_at", limit=50, offset=0)

    assert [r.match_id for r in rows] == [m_first, m_second, m_third]


def test_filters_by_provider_id(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid_a, _cid_a = _seed_provider_and_canonical(db_session, market_id=market, name="Producto A")
    pid_b, _cid_b = _seed_provider_and_canonical(db_session, market_id=market, name="Producto B")
    _sp_a, m_a = _seed_pending_match(db_session, pid_a, confidence=0.4)
    _sp_b, m_b = _seed_pending_match(db_session, pid_b, confidence=0.4)

    use_case = ListReviewQueue(SqlProductMatchRepository(db_session))
    rows, total = use_case.execute(market, provider_id=pid_a, limit=50, offset=0)

    assert total == 1
    assert [r.match_id for r in rows] == [m_a]
    assert m_b not in [r.match_id for r in rows]


def test_filters_by_method(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, _cid = _seed_provider_and_canonical(db_session, market_id=market)
    _sp_llm, m_llm = _seed_pending_match(db_session, pid, confidence=0.4, method="llm")
    _sp_human, m_human = _seed_pending_match(db_session, pid, confidence=0.4, method="human")

    use_case = ListReviewQueue(SqlProductMatchRepository(db_session))
    rows, total = use_case.execute(market, method="llm", limit=50, offset=0)

    assert total == 1
    assert [r.match_id for r in rows] == [m_llm]
    assert m_human not in [r.match_id for r in rows]


def test_filters_by_confidence_range(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, _cid = _seed_provider_and_canonical(db_session, market_id=market)
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    _sp_low, m_low = _seed_pending_match(db_session, pid, confidence=0.10)
    _set_created_at(db_session, m_low, base)
    _sp_mid, m_mid = _seed_pending_match(db_session, pid, confidence=0.30)
    _set_created_at(db_session, m_mid, base + timedelta(seconds=1))
    _sp_high, m_high = _seed_pending_match(db_session, pid, confidence=0.53)
    _set_created_at(db_session, m_high, base + timedelta(seconds=2))

    use_case = ListReviewQueue(SqlProductMatchRepository(db_session))
    rows, total = use_case.execute(
        market, confidence_range=(0.25, 0.60), order_by="created_at", limit=50, offset=0
    )

    assert total == 2
    assert [r.match_id for r in rows] == [m_mid, m_high]
    assert m_low not in [r.match_id for r in rows]


def test_filters_by_run_id(db_session) -> None:  # type: ignore[no-untyped-def]
    """Deep-link corrida→cola (F4 #4.7): `run_id` filtra los `product_match` de UNA corrida.
    Es lo que hace que el número 'a la cola' de una fila de la consola de Orquestación enlace a
    EXACTAMENTE esas filas — el conteo clicado iguala la cola filtrada (usa el índice compuesto
    `ix_product_match_run_status (run_id, status)`)."""
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, _cid = _seed_provider_and_canonical(db_session, market_id=market)
    _sp_a, m_run_a = _seed_pending_match(db_session, pid, confidence=0.4, run_id="run-aaa")
    _sp_b, m_run_b = _seed_pending_match(db_session, pid, confidence=0.4, run_id="run-bbb")
    _sp_none, m_no_run = _seed_pending_match(db_session, pid, confidence=0.4, run_id=None)

    use_case = ListReviewQueue(SqlProductMatchRepository(db_session))
    rows, total = use_case.execute(market, run_id="run-aaa", limit=50, offset=0)

    assert total == 1
    assert [r.match_id for r in rows] == [m_run_a]
    assert m_run_b not in [r.match_id for r in rows]
    assert m_no_run not in [r.match_id for r in rows]


def test_run_id_filter_composes_with_other_filters(db_session) -> None:  # type: ignore[no-untyped-def]
    """El filtro por corrida se COMPONE con los existentes (method/confidence): una corrida grande
    sigue siendo acotable por método sin perder el `run_id`."""
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, _cid = _seed_provider_and_canonical(db_session, market_id=market)
    _sp1, m_llm = _seed_pending_match(db_session, pid, confidence=0.4, method="llm", run_id="run-x")
    _sp2, _m_human = _seed_pending_match(
        db_session, pid, confidence=0.4, method="human", run_id="run-x"
    )

    use_case = ListReviewQueue(SqlProductMatchRepository(db_session))
    rows, total = use_case.execute(market, run_id="run-x", method="llm", limit=50, offset=0)

    assert total == 1
    assert [r.match_id for r in rows] == [m_llm]


def test_pagination_respects_limit_offset_and_reports_total(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, _cid = _seed_provider_and_canonical(db_session, market_id=market)
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    match_ids = []
    for i in range(5):
        _sp, m = _seed_pending_match(db_session, pid, confidence=0.4)
        _set_created_at(db_session, m, base + timedelta(seconds=i))
        match_ids.append(m)

    use_case = ListReviewQueue(SqlProductMatchRepository(db_session))
    page1, total1 = use_case.execute(market, order_by="created_at", limit=2, offset=0)
    page2, total2 = use_case.execute(market, order_by="created_at", limit=2, offset=2)

    assert total1 == 5
    assert total2 == 5
    assert len(page1) == 2
    assert len(page2) == 2
    assert [r.match_id for r in page1] == match_ids[0:2]
    assert [r.match_id for r in page2] == match_ids[2:4]


def test_row_carries_provider_name_raw_attrs_and_candidate_count(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, _cid = _seed_provider_and_canonical(db_session, market_id=market)
    sp_id, match_id = _seed_pending_match(db_session, pid, confidence=0.4)
    from src.contexts.save.infrastructure.models import StoreProductModel

    sp_row = db_session.get(StoreProductModel, uuid.UUID(sp_id))
    sp_row.name = "Arroz Selecto 10lb"
    sp_row.brand = "La Garza"
    db_session.flush()

    use_case = ListReviewQueue(SqlProductMatchRepository(db_session))
    rows, _total = use_case.execute(market, limit=50, offset=0)

    assert len(rows) == 1
    row = rows[0]
    assert row.provider_name == "Sirena"  # nombre seedeado por _seed_provider_and_canonical
    assert row.store_product_name == "Arroz Selecto 10lb"
    assert row.store_product_brand == "La Garza"
    assert row.candidate_count == 0  # nadie llamó record_candidates para este match


def test_row_carries_provider_logo_store_product_image_and_null_category(db_session) -> None:  # type: ignore[no-untyped-def]
    """admin-workspace Batch 1: la row de la cola de revisión trae `provider_logo_url`
    (join a `provider.logo_url`) y `store_product_image_url` (mismo campo que ya usa el
    detail), para el thumbnail/logo de la tabla del admin (Figma 483:12411). `category_*`
    queda SIEMPRE None este batch — la clasificación (`save-category-classification`) es un
    cambio de backend separado que todavía no existe."""
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, _cid = _seed_provider_and_canonical(
        db_session, market_id=market, logo_url="https://cdn.cuadra.app/logos/sirena.png"
    )
    sp_id, match_id = _seed_pending_match(db_session, pid, confidence=0.4)
    from src.contexts.save.infrastructure.models import StoreProductModel

    sp_row = db_session.get(StoreProductModel, uuid.UUID(sp_id))
    sp_row.image_url = "https://cdn.provider.com/arroz.png"
    sp_row.url = "https://sirena.do/arroz-10lb/p"  # F0: link a la tienda en la fila
    db_session.flush()

    use_case = ListReviewQueue(SqlProductMatchRepository(db_session))
    rows, _total = use_case.execute(market, limit=50, offset=0)

    assert len(rows) == 1
    row = rows[0]
    assert row.provider_logo_url == "https://cdn.cuadra.app/logos/sirena.png"
    assert row.store_product_image_url == "https://cdn.provider.com/arroz.png"
    assert row.store_product_url == "https://sirena.do/arroz-10lb/p"
    assert row.category_slug is None
    assert row.category_name is None


def _seed_named_match(  # type: ignore[no-untyped-def]
    db_session, provider_id: str, name: str, *, confidence: float = 0.5, brand: str | None = None
) -> str:
    from src.contexts.save.infrastructure.models import StoreProductModel

    sp = StoreProductModel(
        provider_id=uuid.UUID(provider_id),
        external_id=f"sku-{uuid.uuid4().hex[:8]}",
        current_price_minor=42400,
        currency="DOP",
        name=name,
        brand=brand,
    )
    db_session.add(sp)
    db_session.flush()
    return SqlProductMatchRepository(db_session).record_match(
        store_product_id=str(sp.id), canonical_product_id=None,
        confidence=confidence, method="human", status="pending_review",
    )


def test_order_by_column_ascending_and_descending(db_session) -> None:  # type: ignore[no-untyped-def]
    """Sort funcional por columna en AMBAS direcciones (Figma header): `order_by="name"` = A→Z,
    prefijo `-` = Z→A. El orden NO depende de la incertidumbre (confianzas mezcladas a propósito)."""
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, _cid = _seed_provider_and_canonical(db_session, market_id=market)
    m_cebolla = _seed_named_match(db_session, pid, "Cebolla", confidence=0.9)
    m_arroz = _seed_named_match(db_session, pid, "Arroz", confidence=0.1)
    m_banana = _seed_named_match(db_session, pid, "Banana", confidence=0.5)

    use_case = ListReviewQueue(SqlProductMatchRepository(db_session))

    rows_asc, total = use_case.execute(market, order_by="name", limit=50, offset=0)
    assert total == 3
    assert [r.match_id for r in rows_asc] == [m_arroz, m_banana, m_cebolla]

    rows_desc, _ = use_case.execute(market, order_by="-name", limit=50, offset=0)
    assert [r.match_id for r in rows_desc] == [m_cebolla, m_banana, m_arroz]


def test_order_by_created_at_respects_descending_prefix(db_session) -> None:  # type: ignore[no-untyped-def]
    """`-created_at` = LIFO (más nuevo primero); `created_at` sigue siendo FIFO (compat)."""
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, _cid = _seed_provider_and_canonical(db_session, market_id=market)
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    _sp1, m_first = _seed_pending_match(db_session, pid, confidence=0.5)
    _set_created_at(db_session, m_first, base)
    _sp2, m_last = _seed_pending_match(db_session, pid, confidence=0.5)
    _set_created_at(db_session, m_last, base + timedelta(hours=1))

    use_case = ListReviewQueue(SqlProductMatchRepository(db_session))
    rows_desc, _ = use_case.execute(market, order_by="-created_at", limit=50, offset=0)
    assert [r.match_id for r in rows_desc] == [m_last, m_first]
