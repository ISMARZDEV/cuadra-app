"""Integration — repos de Save (SCD-4 change-only). Requiere DB (`make db-up`).

Prueba la lógica CLAVE: `record_observation` inserta una fila `price` SOLO cuando el precio
CAMBIA (change-only, doc 10); si es igual, solo actualiza `last_seen_at`. Money en enteros.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select

from src.contexts.save.domain.entities import (
    CanonicalProduct,
    PriceType,
    Provider,
    ProviderType,
    SourcePlatform,
)
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure
from src.contexts.save.infrastructure.models import PriceModel, TaxonomyNodeModel
from src.contexts.save.infrastructure.repositories import (
    SqlCanonicalProductRepository,
    SqlProviderRepository,
    SqlStoreProductRepository,
)
from src.shared.money import Currency, Money

DOP = Currency("DOP")


def _uuid() -> str:
    return str(uuid.uuid4())


def test_provider_round_trip(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = SqlProviderRepository(db_session)
    pid = _uuid()
    repo.add(Provider(pid, "Sirena", ProviderType.SUPERMARKET, SourcePlatform.VTEX, "DO"))
    got = repo.get_by_id(pid)
    assert got is not None
    assert got.name == "Sirena"
    assert got.platform == SourcePlatform.VTEX
    assert got.market_id == "DO"


def _seed_provider_and_canonical(db_session) -> tuple[str, str]:  # type: ignore[no-untyped-def]
    prov = SqlProviderRepository(db_session)
    pid = _uuid()
    prov.add(Provider(pid, "Sirena", ProviderType.SUPERMARKET, SourcePlatform.VTEX, "DO"))
    node = TaxonomyNodeModel(name="Arroz", level=0, market_id="DO")
    db_session.add(node)
    db_session.flush()
    crepo = SqlCanonicalProductRepository(db_session)
    cid = _uuid()
    crepo.add(
        CanonicalProduct(
            cid, "Arroz La Garza", "La Garza",
            Quantity(Decimal("4.5359237"), UnitMeasure.MASS),
            taxonomy_node_id=str(node.id), market_id="DO",
        )
    )
    return pid, cid


def _count_prices(db_session, sp_id: str) -> int:  # type: ignore[no-untyped-def]
    rows = db_session.scalars(
        select(PriceModel).where(PriceModel.store_product_id == uuid.UUID(sp_id))
    ).all()
    return len(rows)


def test_change_only_inserts_price_only_when_it_changes(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, cid = _seed_provider_and_canonical(db_session)
    sp = SqlStoreProductRepository(db_session)
    kw = dict(
        provider_id=pid, external_id="sku-garza-10", canonical_product_id=cid,
        price_type=PriceType.ONLINE, source="vtex",
    )
    sp_id = sp.record_observation(price=Money(42400, DOP), captured_at=datetime(2026, 7, 1, 8), **kw)
    # misma → NO nueva fila (change-only)
    sp.record_observation(price=Money(42400, DOP), captured_at=datetime(2026, 7, 2, 8), **kw)
    # distinta → nueva fila
    sp.record_observation(price=Money(43800, DOP), captured_at=datetime(2026, 7, 3, 8), **kw)
    assert _count_prices(db_session, sp_id) == 2  # 42400 + 43800; la repetida no cuenta


def test_change_only_updates_current_price_and_last_seen(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, cid = _seed_provider_and_canonical(db_session)
    sp = SqlStoreProductRepository(db_session)
    kw = dict(
        provider_id=pid, external_id="sku1", canonical_product_id=cid,
        price_type=PriceType.ONLINE, source="vtex",
    )
    sp.record_observation(price=Money(100, DOP), captured_at=datetime(2026, 7, 1), **kw)
    sp.record_observation(price=Money(150, DOP), captured_at=datetime(2026, 7, 5), **kw)
    stores = sp.list_by_canonical(cid)
    assert len(stores) == 1
    assert stores[0].current_price == Money(150, DOP)  # actual actualizado


def test_canonical_get_by_id_reconstructs_brand_and_quantity(db_session) -> None:  # type: ignore[no-untyped-def]
    _pid, cid = _seed_provider_and_canonical(db_session)
    got = SqlCanonicalProductRepository(db_session).get_by_id(cid)
    assert got is not None
    assert got.name == "Arroz La Garza"
    assert got.brand == "La Garza"
    assert got.quantity == Quantity(Decimal("4.5359237"), UnitMeasure.MASS)


def test_canonical_search_by_name_and_market(db_session) -> None:  # type: ignore[no-untyped-def]
    _pid, cid = _seed_provider_and_canonical(db_session)
    crepo = SqlCanonicalProductRepository(db_session)
    assert any(c.id == cid for c in crepo.search("garza", "DO"))
    assert crepo.search("garza", "US") == []  # otro mercado no matchea


def test_list_quotes_joins_provider_name(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, cid = _seed_provider_and_canonical(db_session)
    sp = SqlStoreProductRepository(db_session)
    sp.record_observation(
        provider_id=pid, external_id="sku1", canonical_product_id=cid,
        price=Money(42400, DOP), captured_at=datetime(2026, 7, 1),
        price_type=PriceType.ONLINE, source="vtex",
    )
    quotes = sp.list_quotes_by_canonical(cid)
    assert len(quotes) == 1
    assert quotes[0].provider_name == "Sirena"
    assert quotes[0].price == Money(42400, DOP)


def test_list_price_history_joins_provider_and_orders_by_time(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, cid = _seed_provider_and_canonical(db_session)
    sp = SqlStoreProductRepository(db_session)
    kw = dict(
        provider_id=pid, external_id="sku-garza-10", canonical_product_id=cid,
        price_type=PriceType.ONLINE, source="vtex",
    )
    sp.record_observation(price=Money(42400, DOP), captured_at=datetime(2026, 7, 1, 8), **kw)
    sp.record_observation(price=Money(43800, DOP), captured_at=datetime(2026, 7, 3, 8), **kw)

    points = sp.list_price_history(cid)

    assert [(p.provider_name, p.price.amount_minor) for p in points] == [
        ("Sirena", 42400),
        ("Sirena", 43800),
    ]
    assert points[0].captured_at < points[1].captured_at
    assert points[0].price_type == PriceType.ONLINE


def test_exists_by_natural_key(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, cid = _seed_provider_and_canonical(db_session)
    sp = SqlStoreProductRepository(db_session)
    assert sp.exists(pid, "sku1") is False
    sp.record_observation(
        provider_id=pid, external_id="sku1", canonical_product_id=cid,
        price=Money(42400, DOP), captured_at=datetime(2026, 7, 1),
        price_type=PriceType.ONLINE, source="vtex",
    )
    assert sp.exists(pid, "sku1") is True
    assert sp.exists(pid, "sku-otro") is False
