"""Integration — selección por frescura de F3.2a (`list_stale_covered`). Requiere DB.

Devuelve los `store_product` YA cubiertos (con canónico) y VIEJOS: disponibles con `last_seen_at`
> 18h, u ocultos > 3d (patrón SRD §3.1). Los frescos, los ocultos recientes y los NO cubiertos NO
aparecen. Orden: el más viejo primero. `now` explícito → determinista.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from src.contexts.save.infrastructure.models import StoreProductModel
from src.contexts.save.infrastructure.repositories import SqlStoreProductRepository

from src.contexts.save.domain.entities import PriceType
from src.shared.money import Currency, Money

from .test_product_match_repository import _seed_provider_and_canonical, _seed_store_product


def _set_seen(db_session, sp_id, *, available, last_seen):  # type: ignore[no-untyped-def]
    m = db_session.get(StoreProductModel, uuid.UUID(sp_id))
    m.is_available = available
    m.last_seen_at = last_seen
    db_session.flush()


def test_list_stale_covered_selects_by_freshness(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, cid = _seed_provider_and_canonical(db_session, market_id=market)  # Sirena/VTEX
    now = datetime(2026, 7, 12, 12, 0, tzinfo=timezone.utc)

    fresh = _seed_store_product(db_session, pid, cid)
    stale_visible = _seed_store_product(db_session, pid, cid)
    hidden_recent = _seed_store_product(db_session, pid, cid)
    hidden_stale = _seed_store_product(db_session, pid, cid)
    uncovered = _seed_store_product(db_session, pid, None)  # sin canónico → NO cubierto

    _set_seen(db_session, fresh, available=True, last_seen=now - timedelta(hours=2))
    _set_seen(db_session, stale_visible, available=True, last_seen=now - timedelta(hours=20))
    _set_seen(db_session, hidden_recent, available=False, last_seen=now - timedelta(days=2))
    _set_seen(db_session, hidden_stale, available=False, last_seen=now - timedelta(days=4))
    _set_seen(db_session, uncovered, available=True, last_seen=now - timedelta(hours=30))

    stale = SqlStoreProductRepository(db_session).list_stale_covered(market, now)
    ids = [s.store_product_id for s in stale]

    assert stale_visible in ids and hidden_stale in ids   # viejos → se refrescan
    assert fresh not in ids                               # fresco → se salta
    assert hidden_recent not in ids                       # oculto reciente (<3d) → se salta
    assert uncovered not in ids                           # sin canónico → no es "cubierto"
    assert ids.index(hidden_stale) < ids.index(stale_visible)  # más viejo primero (4d antes que 20h)
    assert all(s.platform.value == "vtex" for s in stale)      # trae la plataforma (para el gate/adapter)


def test_list_stale_covered_carries_source_ref(db_session) -> None:  # type: ignore[no-untyped-def]
    # §15.3: el localizador de detalle (source_ref) viaja para el re-fetch por-producto (Bravo /get).
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, cid = _seed_provider_and_canonical(db_session, market_id=market)
    now = datetime(2026, 7, 12, 12, 0, tzinfo=timezone.utc)
    sp = _seed_store_product(db_session, pid, cid)
    m = db_session.get(StoreProductModel, uuid.UUID(sp))
    m.source_ref = {"id_articulo": "29866"}
    _set_seen(db_session, sp, available=True, last_seen=now - timedelta(hours=20))

    stale = SqlStoreProductRepository(db_session).list_stale_covered(market, now)

    assert stale[0].source_ref == {"id_articulo": "29866"}


def test_list_stale_known_includes_uncovered(db_session) -> None:  # type: ignore[no-untyped-def]
    """`price_refresh` re-precia TODO lo conocido: a diferencia de covered, INCLUYE los no-cubiertos
    (en revisión) viejos — mismo filtro de frescura, sin exigir canónico."""
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, cid = _seed_provider_and_canonical(db_session, market_id=market)
    now = datetime(2026, 7, 12, 12, 0, tzinfo=timezone.utc)

    covered_stale = _seed_store_product(db_session, pid, cid)
    uncovered_stale = _seed_store_product(db_session, pid, None)   # en revisión (sin canónico)
    uncovered_fresh = _seed_store_product(db_session, pid, None)

    _set_seen(db_session, covered_stale, available=True, last_seen=now - timedelta(hours=20))
    _set_seen(db_session, uncovered_stale, available=True, last_seen=now - timedelta(hours=20))
    _set_seen(db_session, uncovered_fresh, available=True, last_seen=now - timedelta(hours=2))

    repo = SqlStoreProductRepository(db_session)
    known_ids = [s.store_product_id for s in repo.list_stale_known(market, now)]
    covered_ids = [s.store_product_id for s in repo.list_stale_covered(market, now)]

    assert uncovered_stale in known_ids and covered_stale in known_ids  # known trae AMBOS
    assert uncovered_fresh not in known_ids                            # fresco → se salta
    assert uncovered_stale not in covered_ids                          # contraste: covered NO lo trae


def test_stale_covered_carries_the_canonical_id_as_recovery_key(db_session) -> None:  # type: ignore[no-untyped-def]
    """F3.2b: sin `canonical_product_id` en la fila, el use-case no puede pedir el EAN del canónico
    → la llave de recuperación llega siempre None y el recovery NUNCA se dispara."""
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, cid = _seed_provider_and_canonical(db_session, market_id=market)
    now = datetime(2026, 7, 12, 12, 0, tzinfo=timezone.utc)
    sp = _seed_store_product(db_session, pid, cid)
    _set_seen(db_session, sp, available=True, last_seen=now - timedelta(hours=30))

    stale = SqlStoreProductRepository(db_session).list_stale_covered(market, now)

    row = next(s for s in stale if s.store_product_id == sp)
    assert row.canonical_product_id == cid, "la llave de recuperación viaja en la fila"


def test_record_observation_backfills_the_ean_when_the_detail_finally_brings_it(db_session) -> None:  # type: ignore[no-untyped-def]
    """§15.5: el browse de Bravo NO trae barcode y el detalle SÍ. `price_refresh` ya llama al /get por
    cada producto conocido → si `record_observation` refresca el ean, la cosecha sale GRATIS (sin una
    request extra). Sin esto, el barcode se descarta en cada refresh y solo se escribiría al crear."""
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, cid = _seed_provider_and_canonical(db_session, market_id=market)
    sp_id = _seed_store_product(db_session, pid, cid)  # nació sin ean (vino del browse)
    repo = SqlStoreProductRepository(db_session)
    ext = db_session.get(StoreProductModel, uuid.UUID(sp_id)).external_id
    assert db_session.get(StoreProductModel, uuid.UUID(sp_id)).ean is None

    repo.record_observation(
        provider_id=pid, external_id=ext, canonical_product_id=None,
        price=Money(42400, Currency("DOP")), captured_at=datetime.now(timezone.utc),
        price_type=PriceType.ONLINE, source="bravova", ean="7460083780146",
    )

    assert db_session.get(StoreProductModel, uuid.UUID(sp_id)).ean == "7460083780146"


def test_record_observation_never_erases_a_known_ean_with_none(db_session) -> None:  # type: ignore[no-untyped-def]
    """Misma regla que name/brand/source_ref: una observación posterior SIN el dato (p.ej. el browse,
    que nunca trae barcode) no debe pisar lo ya conocido por el detalle."""
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, cid = _seed_provider_and_canonical(db_session, market_id=market)
    sp_id = _seed_store_product(db_session, pid, cid)
    repo = SqlStoreProductRepository(db_session)
    ext = db_session.get(StoreProductModel, uuid.UUID(sp_id)).external_id
    common = dict(
        provider_id=pid, external_id=ext, canonical_product_id=None,
        price=Money(42400, Currency("DOP")), price_type=PriceType.ONLINE, source="bravova",
    )
    repo.record_observation(captured_at=datetime.now(timezone.utc), ean="7460083780146", **common)

    repo.record_observation(captured_at=datetime.now(timezone.utc), ean=None, **common)  # browse

    assert db_session.get(StoreProductModel, uuid.UUID(sp_id)).ean == "7460083780146"
