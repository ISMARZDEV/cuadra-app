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


def _seed_provider_and_canonical(db_session, market_id: str = "DO") -> tuple[str, str]:  # type: ignore[no-untyped-def]
    prov = SqlProviderRepository(db_session)
    pid = _uuid()
    prov.add(Provider(pid, "Sirena", ProviderType.SUPERMARKET, SourcePlatform.VTEX, market_id))
    node = TaxonomyNodeModel(name="Arroz", level=0, market_id=market_id)
    db_session.add(node)
    db_session.flush()
    crepo = SqlCanonicalProductRepository(db_session)
    cid = _uuid()
    crepo.add(
        CanonicalProduct(
            cid, "Arroz La Garza", "La Garza",
            Quantity(Decimal("4.5359237"), UnitMeasure.MASS),
            taxonomy_node_id=str(node.id), market_id=market_id,
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


def test_canonical_get_by_id_invalid_uuid_returns_none(db_session) -> None:  # type: ignore[no-untyped-def]
    # id malformado NO debe reventar (ValueError→500): devuelve None → el use case da 404 limpio.
    repo = SqlCanonicalProductRepository(db_session)
    assert repo.get_by_id("no-es-un-uuid") is None


def test_canonical_list_by_market_for_sitemap(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    _pid, cid = _seed_provider_and_canonical(db_session, market_id=market)
    repo = SqlCanonicalProductRepository(db_session)

    listed = repo.list_by_market(market)
    assert [p.id for p in listed] == [cid]
    # mercado distinto → vacío (no arrastra datos reales de "DO" de la DB dev)
    assert repo.list_by_market(f"T{uuid.uuid4().hex[:6]}") == []


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


def test_list_price_changes_pairs_consecutive_prices(db_session) -> None:  # type: ignore[no-untyped-def]
    # mercado sintético: la consulta es market-wide y la DB dev puede tener datos reales de "DO"
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, cid = _seed_provider_and_canonical(db_session, market_id=market)
    sp = SqlStoreProductRepository(db_session)
    kw = dict(
        provider_id=pid, external_id="sku-garza-10", canonical_product_id=cid,
        price_type=PriceType.ONLINE, source="vtex",
    )
    sp.record_observation(price=Money(47500, DOP), captured_at=datetime(2026, 7, 1, 8), **kw)
    sp.record_observation(price=Money(45000, DOP), captured_at=datetime(2026, 7, 3, 8), **kw)
    # producto con UNA sola observación → sin par (no hay previous)
    sp.record_observation(
        provider_id=pid, external_id="sku-solo", canonical_product_id=cid,
        price=Money(10000, DOP), captured_at=datetime(2026, 7, 3, 9),
        price_type=PriceType.ONLINE, source="vtex",
    )

    changes = sp.list_price_changes(market, since=datetime(2026, 7, 2))

    assert len(changes) == 1
    ch = changes[0]
    assert ch.previous == Money(47500, DOP)
    assert ch.current == Money(45000, DOP)
    assert ch.provider_name == "Sirena"
    assert ch.canonical_product_id == cid
    assert ch.product_name == "Arroz La Garza"


def test_list_price_changes_respects_since_window(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    pid, cid = _seed_provider_and_canonical(db_session, market_id=market)
    sp = SqlStoreProductRepository(db_session)
    kw = dict(
        provider_id=pid, external_id="sku-garza-10", canonical_product_id=cid,
        price_type=PriceType.ONLINE, source="vtex",
    )
    sp.record_observation(price=Money(47500, DOP), captured_at=datetime(2026, 7, 1, 8), **kw)
    sp.record_observation(price=Money(45000, DOP), captured_at=datetime(2026, 7, 3, 8), **kw)

    # ventana que empieza DESPUÉS del cambio → vacío
    assert sp.list_price_changes(market, since=datetime(2026, 7, 4)) == []
    # mercado distinto → vacío
    assert sp.list_price_changes(f"T{uuid.uuid4().hex[:6]}", since=datetime(2026, 7, 2)) == []


def test_taxonomy_tree_ancestors_and_products(db_session) -> None:  # type: ignore[no-untyped-def]
    from src.contexts.save.infrastructure.repositories import SqlTaxonomyRepository

    market = f"T{uuid.uuid4().hex[:6]}"
    # árbol: Despensa & Abarrotes > Arroz, Granos & Legumbres > Arroz
    despensa = TaxonomyNodeModel(name="Despensa & Abarrotes", level=0, market_id=market)
    db_session.add(despensa)
    db_session.flush()
    granos = TaxonomyNodeModel(
        name="Arroz, Granos & Legumbres", level=1, market_id=market, parent_id=despensa.id
    )
    db_session.add(granos)
    db_session.flush()
    arroz = TaxonomyNodeModel(name="Arroz", level=2, market_id=market, parent_id=granos.id)
    db_session.add(arroz)
    db_session.flush()

    crepo = SqlCanonicalProductRepository(db_session)
    cid = _uuid()
    crepo.add(
        CanonicalProduct(
            cid, "Arroz La Garza", "La Garza",
            Quantity(Decimal("4.5359237"), UnitMeasure.MASS),
            taxonomy_node_id=str(arroz.id), market_id=market,
        )
    )

    repo = SqlTaxonomyRepository(db_session)

    tree = repo.list_tree(market)
    assert [n.name for n in tree] == ["Despensa & Abarrotes"]
    assert tree[0].slug == "despensa-abarrotes"
    assert tree[0].children[0].children[0].name == "Arroz"

    # breadcrumb raíz→nodo del producto
    crumb = repo.ancestors(str(arroz.id))
    assert [n.name for n in crumb] == ["Despensa & Abarrotes", "Arroz, Granos & Legumbres", "Arroz"]

    # productos bajo la categoría padre (incluye descendientes)
    under = repo.list_products_under(str(granos.id))
    assert [p.id for p in under] == [cid]
    assert repo.list_products_under(str(despensa.id))[0].id == cid  # sube más arriba también


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
