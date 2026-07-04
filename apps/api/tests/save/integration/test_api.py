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


def _seed(db_session: Session) -> str:
    prov = SqlProviderRepository(db_session)
    p_merca, p_sirena = str(uuid.uuid4()), str(uuid.uuid4())
    prov.add(Provider(p_merca, "Merca", ProviderType.SUPERMARKET, SourcePlatform.MAGENTO, "DO"))
    prov.add(Provider(p_sirena, "Sirena", ProviderType.SUPERMARKET, SourcePlatform.VTEX, "DO"))
    node = TaxonomyNodeModel(name="Arroz", level=0, market_id="DO")
    db_session.add(node)
    db_session.flush()
    cid = str(uuid.uuid4())
    SqlCanonicalProductRepository(db_session).add(
        CanonicalProduct(
            cid, "Arroz La Garza 10 Lbs", "La Garza",
            Quantity(Decimal("4.5359237"), UnitMeasure.MASS),
            taxonomy_node_id=str(node.id), market_id="DO",
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
    cid = _seed(db_session)
    r = _client(db_session).get("/v1/save/compare", params={"product_id": cid})
    assert r.status_code == 200
    body = r.json()
    assert body["cheapest_provider"] == "Merca"
    assert body["entries"][0]["provider_name"] == "Merca"
    assert body["entries"][0]["is_cheapest"] is True
    assert body["entries"][1]["extra_minor"] == 5100  # 475 - 424


def test_compare_endpoint_404_when_missing(db_session: Session) -> None:
    r = _client(db_session).get("/v1/save/compare", params={"product_id": str(uuid.uuid4())})
    assert r.status_code == 404
