"""Integration — endpoints de Save (HTTP + DB). GET /v1/save/search y /v1/save/compare.

Catálogo público (sin auth): son datos de precio, no del usuario. Override de get_session con
el db_session transaccional (comparte transacción → ve lo sembrado). Requiere DB.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.api.composition_root import get_session
from src.contexts.save.domain.entities import (
    CanonicalProduct,
    PriceType,
    Provider,
    ProviderType,
    SourcePlatform,
)
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure
from src.contexts.save.infrastructure.models import TaxonomyNodeModel
from src.contexts.save.infrastructure.repositories import (
    SqlCanonicalProductRepository,
    SqlProviderRepository,
    SqlStoreProductRepository,
)
from src.main import app
from src.shared.money import Currency, Money

DOP = Currency("DOP")


def _client(db_session: Session) -> TestClient:
    app.dependency_overrides[get_session] = lambda: db_session
    return TestClient(app)


def _seed(db_session: Session, market_id: str = "DO") -> str:
    prov = SqlProviderRepository(db_session)
    p_merca, p_sirena = str(uuid.uuid4()), str(uuid.uuid4())
    prov.add(
        Provider(p_merca, "Merca", ProviderType.SUPERMARKET, SourcePlatform.MAGENTO, market_id)
    )
    prov.add(
        Provider(p_sirena, "Sirena", ProviderType.SUPERMARKET, SourcePlatform.VTEX, market_id)
    )
    node = TaxonomyNodeModel(name="Arroz", level=0, market_id=market_id)
    db_session.add(node)
    db_session.flush()
    cid = str(uuid.uuid4())
    SqlCanonicalProductRepository(db_session).add(
        CanonicalProduct(
            cid, "Arroz La Garza 10 Lbs", "La Garza",
            Quantity(Decimal("4.5359237"), UnitMeasure.MASS),
            taxonomy_node_id=str(node.id), market_id=market_id,
        )
    )
    sp = SqlStoreProductRepository(db_session)
    sp.record_observation(
        provider_id=p_merca, external_id="m1", canonical_product_id=cid,
        price=Money(42400, DOP), captured_at=datetime(2026, 7, 1),
        price_type=PriceType.ONLINE, source="magento",
    )
    sp.record_observation(
        provider_id=p_sirena, external_id="s1", canonical_product_id=cid,
        price=Money(47500, DOP), captured_at=datetime(2026, 7, 1),
        price_type=PriceType.ONLINE, source="vtex",
    )
    return cid


def test_search_endpoint_finds_product(db_session: Session) -> None:
    cid = _seed(db_session)
    r = _client(db_session).get("/v1/save/search", params={"q": "arroz", "market": "DO"})
    assert r.status_code == 200
    assert any(item["id"] == cid for item in r.json())


def test_compare_endpoint_returns_sorted_table(db_session: Session) -> None:
    _seed(db_session)  # "Arroz La Garza 10 Lbs" → slug determinista
    r = _client(db_session).get(
        "/v1/save/compare", params={"slug": "arroz-la-garza-10-lbs", "market": "DO"}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["slug"] == "arroz-la-garza-10-lbs"
    assert body["cheapest_provider"] == "Merca"
    assert body["entries"][0]["provider_name"] == "Merca"
    assert body["entries"][0]["is_cheapest"] is True
    assert body["entries"][1]["extra_minor"] == 5100  # 475 - 424


def test_compare_endpoint_404_when_missing(db_session: Session) -> None:
    r = _client(db_session).get(
        "/v1/save/compare", params={"slug": "no-existe", "market": "DO"}
    )
    assert r.status_code == 404


def test_history_endpoint_returns_series_per_provider(db_session: Session) -> None:
    cid = _seed(db_session)
    r = _client(db_session).get(
        "/v1/save/history", params={"product_id": cid, "range": "all"}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["canonical_product_id"] == cid
    assert body["range"] == "all"
    by_name = {s["provider_name"]: s for s in body["series"]}
    assert set(by_name) == {"Merca", "Sirena"}
    assert by_name["Merca"]["points"][0]["price_minor"] == 42400


def test_history_endpoint_404_when_missing(db_session: Session) -> None:
    r = _client(db_session).get(
        "/v1/save/history", params={"product_id": str(uuid.uuid4()), "range": "1m"}
    )
    assert r.status_code == 404


def test_drops_endpoint_lists_price_drops(db_session: Session) -> None:
    # mercado sintético: /drops es market-wide y la DB dev puede tener datos reales de "DO"
    market = f"T{uuid.uuid4().hex[:6]}"
    cid = _seed(db_session, market_id=market)
    # bajada REAL en Sirena: 475.00 → 450.00 (la seed puso 47500 el 2026-07-01)
    sp = SqlStoreProductRepository(db_session)
    provider_id = next(
        q.provider_id
        for q in sp.list_quotes_by_canonical(cid)
        if q.provider_name == "Sirena"
    )
    sp.record_observation(
        provider_id=provider_id, external_id="s1", canonical_product_id=cid,
        price=Money(45000, DOP), captured_at=datetime(2026, 7, 3),
        price_type=PriceType.ONLINE, source="vtex",
    )

    r = _client(db_session).get("/v1/save/drops", params={"market": market, "days": 3650})
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["provider_name"] == "Sirena"
    assert body[0]["previous_minor"] == 47500
    assert body[0]["current_minor"] == 45000
    assert body[0]["drop_minor"] == 2500
    assert body[0]["drop_bps"] == 526


def test_drops_endpoint_empty_without_drops(db_session: Session) -> None:
    market = f"T{uuid.uuid4().hex[:6]}"
    _seed(db_session, market_id=market)  # una sola observación por tienda → no hay pares
    r = _client(db_session).get("/v1/save/drops", params={"market": market, "days": 3650})
    assert r.status_code == 200
    assert r.json() == []


def _seed_taxonomy(db_session: Session, market: str) -> str:
    despensa = TaxonomyNodeModel(name="Despensa & Abarrotes", level=0, market_id=market)
    db_session.add(despensa)
    db_session.flush()
    granos = TaxonomyNodeModel(
        name="Arroz, Granos & Legumbres", level=1, market_id=market, parent_id=despensa.id
    )
    db_session.add(granos)
    db_session.flush()
    return str(granos.id)


def test_categories_endpoint_returns_tree(db_session: Session) -> None:
    market = f"T{uuid.uuid4().hex[:6]}"
    _seed_taxonomy(db_session, market)
    r = _client(db_session).get("/v1/save/categories", params={"market": market})
    assert r.status_code == 200
    cats = r.json()["categories"]
    assert cats[0]["name"] == "Despensa & Abarrotes"
    assert cats[0]["slug"] == "despensa-abarrotes"
    assert cats[0]["children"][0]["slug"] == "arroz-granos-legumbres"


def test_category_endpoint_breadcrumb_and_404(db_session: Session) -> None:
    market = f"T{uuid.uuid4().hex[:6]}"
    _seed_taxonomy(db_session, market)
    r = _client(db_session).get(
        "/v1/save/category/arroz-granos-legumbres", params={"market": market}
    )
    assert r.status_code == 200
    body = r.json()
    assert [b["name"] for b in body["breadcrumb"]] == [
        "Despensa & Abarrotes",
        "Arroz, Granos & Legumbres",
    ]
    # slug inexistente → 404
    assert (
        _client(db_session)
        .get("/v1/save/category/no-existe", params={"market": market})
        .status_code
        == 404
    )


def test_products_endpoint_lists_market_products(db_session: Session) -> None:
    market = f"T{uuid.uuid4().hex[:6]}"
    cid = _seed(db_session, market_id=market)
    r = _client(db_session).get("/v1/save/products", params={"market": market})
    assert r.status_code == 200
    assert any(item["id"] == cid for item in r.json())


def test_compare_endpoint_resolves_by_uuid_fallback(db_session: Session) -> None:
    # un link privado (lista/alertas) pasa el UUID como `slug` → resuelve igual, canónico = el slug.
    cid = _seed(db_session)
    r = _client(db_session).get("/v1/save/compare", params={"slug": cid, "market": "DO"})
    assert r.status_code == 200
    assert r.json()["slug"] == "arroz-la-garza-10-lbs"


def test_compare_endpoint_wrong_market_is_404(db_session: Session) -> None:
    # el slug es único POR-MERCADO: existe en DO pero no en US → 404 limpio (no 500).
    _seed(db_session)
    r = _client(db_session).get(
        "/v1/save/compare", params={"slug": "arroz-la-garza-10-lbs", "market": "US"}
    )
    assert r.status_code == 404


def test_history_endpoint_422_on_bad_range(db_session: Session) -> None:
    cid = _seed(db_session)
    r = _client(db_session).get(
        "/v1/save/history", params={"product_id": cid, "range": "6m"}
    )
    assert r.status_code == 422
