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
