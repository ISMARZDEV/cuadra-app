"""Integration — GET /admin/save/canonical-products/{id}/history (F5, US-CP-D6/D7).

Lo que se prueba acá y no en unit: que los rangos recorten de verdad contra la tabla `price`
real, y que el baseline carry-in aparezca. La tabla es change-only (doc 10), así que un chart sin
carry-in muestra vacío una tienda que simplemente no movió el precio.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from seeds.identity_seed import seed_identity
from src.api.composition_root import get_session
from src.api.extensions.security import get_current_user_id
from src.contexts.identity.infrastructure.models import UserModel, UserRoleModel
from src.contexts.save.infrastructure.models import (
    CanonicalProductModel,
    PriceModel,
    ProviderModel,
    StoreProductModel,
)
from src.main import app

MARKET = "DO"
NOW = datetime.now(UTC)


def _admin(db_session) -> str:  # type: ignore[no-untyped-def]
    seed_identity(db_session)
    user = UserModel(
        email="hist@cuadra.do", name="hist", home_market_id=MARKET, current_market_id=MARKET
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(UserRoleModel(user_id=user.id, role_key="super_admin"))
    db_session.flush()
    return str(user.id)


def _get(db_session, user_id, path):  # type: ignore[no-untyped-def]
    app.dependency_overrides[get_session] = lambda: db_session
    app.dependency_overrides[get_current_user_id] = lambda: user_id
    try:
        with TestClient(app) as c:
            return c.get(f"/v1/admin/save{path}")
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def seeded(db_session):  # type: ignore[no-untyped-def]
    """Un canónico con DOS tiendas:
    - `vieja`: un solo cambio hace 200 días → dentro de 15d/1m sólo existe por CARRY-IN.
    - `fresca`: cambios hace 40 y 5 días.
    """
    old_provider = ProviderModel(
        name="Tienda Vieja Hist", type="supermarket", platform="vtex", market_id=MARKET
    )
    new_provider = ProviderModel(
        name="Tienda Fresca Hist", type="supermarket", platform="vtex", market_id=MARKET
    )
    db_session.add_all([old_provider, new_provider])
    db_session.flush()

    cp = CanonicalProductModel(
        slug="producto-historico-test",
        name="Producto Historico Test",
        size_amount=Decimal("1"),
        size_measure="count",
        market_id=MARKET,
    )
    db_session.add(cp)
    db_session.flush()

    sp_old = StoreProductModel(
        provider_id=old_provider.id, canonical_product_id=cp.id, external_id="hist-old",
        current_price_minor=10000, currency="DOP", last_seen_at=NOW, is_available=True,
    )
    sp_new = StoreProductModel(
        provider_id=new_provider.id, canonical_product_id=cp.id, external_id="hist-new",
        current_price_minor=12000, currency="DOP", last_seen_at=NOW, is_available=True,
    )
    db_session.add_all([sp_old, sp_new])
    db_session.flush()

    db_session.add_all([
        PriceModel(
            store_product_id=sp_old.id, value_minor=10000, currency="DOP",
            captured_at=NOW - timedelta(days=200), price_type="online", source="test",
        ),
        PriceModel(
            store_product_id=sp_new.id, value_minor=15000, currency="DOP",
            captured_at=NOW - timedelta(days=40), price_type="online", source="test",
        ),
        PriceModel(
            store_product_id=sp_new.id, value_minor=12000, currency="DOP",
            captured_at=NOW - timedelta(days=5), price_type="online", source="test",
        ),
    ])
    db_session.flush()
    return cp


class TestRanges:
    @pytest.mark.parametrize("range_", ["15d", "1m", "3m", "6m", "1y", "all"])
    def test_every_range_the_sdd_asks_for_is_accepted(self, db_session, seeded, range_) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        res = _get(
            db_session, user_id,
            f"/canonical-products/{seeded.id}/history?range={range_}",
        )
        assert res.status_code == 200, res.text
        assert res.json()["range"] == range_

    def test_an_unknown_range_is_rejected(self, db_session, seeded) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        res = _get(db_session, user_id, f"/canonical-products/{seeded.id}/history?range=7d")
        assert res.status_code == 422

    def test_a_short_range_drops_the_older_change(self, db_session, seeded) -> None:  # type: ignore[no-untyped-def]
        """En 15d el cambio de hace 40 días no puede aparecer como un punto propio: pasa a ser
        el baseline (un punto), no dos."""
        user_id = _admin(db_session)
        res = _get(db_session, user_id, f"/canonical-products/{seeded.id}/history?range=15d")

        fresh = next(
            s for s in res.json()["series"] if s["provider_name"] == "Tienda Fresca Hist"
        )
        assert len(fresh["points"]) == 2  # carry-in (40d) + el cambio de 5d
        assert fresh["points"][0]["price_minor"] == 15000

    def test_all_keeps_everything(self, db_session, seeded) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        res = _get(db_session, user_id, f"/canonical-products/{seeded.id}/history?range=all")
        total = sum(len(s["points"]) for s in res.json()["series"])
        assert total == 3


class TestBaselineCarryIn:
    def test_a_store_whose_only_change_predates_the_range_still_has_a_line(self, db_session, seeded) -> None:  # type: ignore[no-untyped-def]
        """`Tienda Vieja` cambió el precio hace 200 días y nada más. En 15d NO tiene cambios,
        pero su precio sigue vigente: sin carry-in su línea desaparecería del chart y el operador
        creería que la tienda dejó de vender el producto."""
        user_id = _admin(db_session)
        res = _get(db_session, user_id, f"/canonical-products/{seeded.id}/history?range=15d")

        old = next(s for s in res.json()["series"] if s["provider_name"] == "Tienda Vieja Hist")
        assert len(old["points"]) == 1
        assert old["points"][0]["price_minor"] == 10000


class TestKpis:
    def test_kpis_come_from_the_current_price_of_each_store(self, db_session, seeded) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        kpis = _get(
            db_session, user_id, f"/canonical-products/{seeded.id}/history?range=all"
        ).json()["kpis"]

        assert kpis["min_price_minor"] == 10000
        assert kpis["max_price_minor"] == 12000
        assert kpis["spread_minor"] == 2000
        assert kpis["active_provider_count"] == 2

    def test_the_change_count_is_the_number_of_changes_inside_the_range(self, db_session, seeded) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        kpis = _get(
            db_session, user_id, f"/canonical-products/{seeded.id}/history?range=15d"
        ).json()["kpis"]
        # Sólo el cambio de hace 5 días ocurrió dentro del rango; los dos carry-in no cuentan.
        assert kpis["price_change_count"] == 1

    def test_money_arrives_as_integers_in_minor_units(self, db_session, seeded) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        body = _get(
            db_session, user_id, f"/canonical-products/{seeded.id}/history?range=all"
        ).json()

        assert isinstance(body["kpis"]["min_price_minor"], int)
        for series in body["series"]:
            for p in series["points"]:
                assert isinstance(p["price_minor"], int)


class TestProviderFilter:
    def test_the_chart_can_be_narrowed_to_one_store(self, db_session, seeded) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        all_series = _get(
            db_session, user_id, f"/canonical-products/{seeded.id}/history?range=all"
        ).json()["series"]
        one = next(s for s in all_series if s["provider_name"] == "Tienda Fresca Hist")

        res = _get(
            db_session, user_id,
            f"/canonical-products/{seeded.id}/history?range=all&provider_ids={one['provider_id']}",
        )
        assert res.status_code == 200
        assert [s["provider_id"] for s in res.json()["series"]] == [one["provider_id"]]


class TestNotFound:
    def test_an_unknown_canonical_is_404(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        res = _get(
            db_session, user_id,
            "/canonical-products/99999999-9999-4999-8999-999999999999/history",
        )
        assert res.status_code == 404

    def test_the_route_is_gated(self, db_session, seeded) -> None:  # type: ignore[no-untyped-def]
        with TestClient(app) as c:
            res = c.get(f"/v1/admin/save/canonical-products/{seeded.id}/history")
        assert res.status_code in (401, 403)
