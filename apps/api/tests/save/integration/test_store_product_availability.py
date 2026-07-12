"""Integration — disponibilidad de `store_product` (F3.0). Requiere DB.

`set_availability` marca disponible/no-disponible SIN borrar; `list_quotes_by_canonical` (el
`/compare` público, "Comprar en X") EXCLUYE lo no disponible — cierra la deuda de F0 (no linkear a
una tienda que ya no lo vende). `record_observation` re-marca disponible al re-observar.
"""
from __future__ import annotations

from datetime import datetime, timezone

from src.contexts.save.domain.entities.price import PriceType
from src.contexts.save.infrastructure.repositories import SqlStoreProductRepository
from src.shared.money import Currency, Money

from .test_product_match_repository import _seed_provider_and_canonical, _seed_store_product


def test_set_availability_marks_unavailable_without_deleting(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid, cid)
    repo = SqlStoreProductRepository(db_session)

    repo.set_availability(sp_id, False)

    rows = repo.list_by_canonical(cid)
    row = next(r for r in rows if r.id == sp_id)
    assert row.available is False  # sigue existiendo (no se borró), marcado no disponible


def test_list_quotes_excludes_unavailable_store_products(db_session) -> None:  # type: ignore[no-untyped-def]
    pid_a, cid = _seed_provider_and_canonical(db_session)
    pid_b, _ = _seed_provider_and_canonical(db_session, name="Otra tienda")
    sp_a = _seed_store_product(db_session, pid_a, cid)
    _seed_store_product(db_session, pid_b, cid)
    repo = SqlStoreProductRepository(db_session)

    repo.set_availability(sp_a, False)  # la tienda A ya no lo vende

    quotes = repo.list_quotes_by_canonical(cid)
    assert all(q.provider_id != pid_a for q in quotes)  # A excluida
    assert any(q.provider_id == pid_b for q in quotes)  # B (disponible) sigue


def test_record_observation_re_marks_available(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid, cid)
    repo = SqlStoreProductRepository(db_session)
    repo.set_availability(sp_id, False)

    from src.contexts.save.infrastructure.models import StoreProductModel

    external_id = db_session.get(StoreProductModel, __import__("uuid").UUID(sp_id)).external_id
    repo.record_observation(
        provider_id=pid,
        external_id=external_id,
        canonical_product_id=cid,
        price=Money(50000, Currency("DOP")),
        captured_at=datetime(2026, 7, 12, tzinfo=timezone.utc),
        price_type=PriceType.ONLINE,
        source="vtex",
    )

    row = next(r for r in repo.list_by_canonical(cid) if r.id == sp_id)
    assert row.available is True  # re-observado → vuelve a estar disponible
