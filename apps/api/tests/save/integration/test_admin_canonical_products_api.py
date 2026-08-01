"""Integration — API admin de Productos Canónicos (F5).

Lo que se prueba acá y no en unit: que el GATE esté puesto (una ruta sin gatear es un agujero, no
un bug de lógica) y que los datos derivados (matched_provider_count, completeness_score) se
calculen correctamente desde la DB real.
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
    BrandModel,
    CanonicalProductModel,
    ProviderModel,
    StoreProductModel,
    TaxonomyNodeModel,
)
from src.main import app

from ._taxonomy import taxonomy_node



def _seed_role_user(db_session, role_key: str) -> str:  # type: ignore[no-untyped-def]
    seed_identity(db_session)
    user = UserModel(
        email=f"{role_key}-catalog@cuadra.do", name=role_key,
        home_market_id="DO", current_market_id="DO",
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(UserRoleModel(user_id=user.id, role_key=role_key))
    db_session.flush()
    return str(user.id)


@pytest.fixture
def client():  # type: ignore[no-untyped-def]
    with TestClient(app) as c:
        yield c


class TestTheGateIsOn:
    """Cada ruta admin necesita su capability. Sin gate, cualquier usuario autenticado podría ver
    y modificar el catálogo canónico — que es la fuente de verdad de precios y comparaciones."""

    @pytest.mark.parametrize(
        ("method", "path"),
        [
            ("get", "/v1/admin/save/canonical-products"),
            ("get", "/v1/admin/save/canonical-products/some-slug"),
            # Acciones por proveedor del detalle (menú de acciones). La primera BORRA una fila y su
            # histórico de precios: si quedara sin gatear, cualquier usuario autenticado podría
            # destruir datos irreversiblemente.
            ("delete", "/v1/admin/save/canonical-products/cid/providers/spid"),
            ("post", "/v1/admin/save/canonical-products/cid/providers/spid/unlink"),
            ("post", "/v1/admin/save/canonical-products/cid/providers/spid/relink"),
            ("post", "/v1/admin/save/canonical-products/cid/providers/spid/promote"),
            # Proxy de imágenes: sin gatear sería un proxy abierto a Internet.
            ("get", "/v1/admin/save/image-proxy?url=https://example.com/a.jpg"),
        ],
    )
    def test_no_route_is_reachable_without_a_token(self, client, method, path) -> None:  # type: ignore[no-untyped-def]
        """Sin token = 401/403. El gate de capability es la ÚNICA protección sobre el catálogo."""
        kwargs = {"json": {}} if method in ("post", "patch", "put") else {}
        response = getattr(client, method)(path, **kwargs)
        assert response.status_code in (401, 403), f"{method.upper()} {path} quedó SIN GATEAR"


class TestListCanonicalProducts:
    """GET /admin/save/canonical-products — listado admin con métricas derivadas."""

    MARKET_ID = "DO"
    PROVIDER_ID = "11111111-1111-4111-8111-111111111111"
    BRAND_ID = "22222222-2222-4222-8222-222222222222"
    TAXONOMY_ID = "33333333-3333-4333-8333-333333333333"
    CANONICAL_ID = "44444444-4444-4444-8444-444444444444"
    STORE_PRODUCT_ID = "55555555-5555-4555-8555-555555555555"

    def _seed_catalog(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Siembra un canónico con 1 store_product matcheado para verificar métricas derivadas.

        Usa `merge()` en vez de `add()` para evitar colisiones con datos residuales de otros tests
        (el fixture `db_session` hace rollback, pero unique constraints pueden fallar si hay datos
        de tests que no usaron el fixture o de seeds manuales).
        """
        from sqlalchemy import select as sa_select

        # Provider
        existing = db_session.scalars(
            sa_select(ProviderModel).where(ProviderModel.id == self.PROVIDER_ID)
        ).first()
        if not existing:
            db_session.add(
                ProviderModel(
                    id=self.PROVIDER_ID, name="Sirena Catalog Test", type="supermarket",
                    platform="vtex", market_id=self.MARKET_ID,
                )
            )
            db_session.flush()

        # Brand (unique constraint por market+name → verificar antes de insertar)
        existing_brand = db_session.scalars(
            sa_select(BrandModel).where(
                BrandModel.market_id == self.MARKET_ID,
                BrandModel.name == "GOYA_CATALOG_TEST",
            )
        ).first()
        if existing_brand:
            brand_id = existing_brand.id
        else:
            brand = BrandModel(
                id=self.BRAND_ID, name="GOYA_CATALOG_TEST", market_id=self.MARKET_ID,
            )
            db_session.add(brand)
            db_session.flush()
            brand_id = brand.id

        # Taxonomy leaf
        existing_tax = db_session.scalars(
            sa_select(TaxonomyNodeModel).where(TaxonomyNodeModel.id == self.TAXONOMY_ID)
        ).first()
        if not existing_tax:
            db_session.add(
                taxonomy_node(db_session, 
                    id=self.TAXONOMY_ID, name="Arroz Catalog Test", level=1,
                    market_id=self.MARKET_ID, parent_id=None,
                )
            )
            db_session.flush()

        # Canonical product
        existing_cp = db_session.scalars(
            sa_select(CanonicalProductModel).where(CanonicalProductModel.id == self.CANONICAL_ID)
        ).first()
        if not existing_cp:
            db_session.add(
                CanonicalProductModel(
                    id=self.CANONICAL_ID,
                    slug="arroz-goya-catalog-test",
                    name="Arroz Goya Catalog Test",
                    brand_id=brand_id,
                    quality="premium",
                    display_size="10 LB",
                    image_url="https://example.com/arroz.jpg",
                    size_amount=Decimal("10.0"),
                    size_measure="mass",
                    taxonomy_node_id=self.TAXONOMY_ID,
                    market_id=self.MARKET_ID,
                    origin_run_id="run-123",
                )
            )
            db_session.flush()

        # Store product (1 provider matcheado)
        existing_sp = db_session.scalars(
            sa_select(StoreProductModel).where(StoreProductModel.id == self.STORE_PRODUCT_ID)
        ).first()
        if not existing_sp:
            db_session.add(
                StoreProductModel(
                    id=self.STORE_PRODUCT_ID,
                    provider_id=self.PROVIDER_ID,
                    canonical_product_id=self.CANONICAL_ID,
                    external_id="ext-catalog-test-123",
                    current_price_minor=15000,  # RD$ 150.00
                    currency="DOP",
                    url="https://sirena.do/arroz-goya",
                    ean="041383001234",
                    last_seen_at=datetime.now(UTC),
                    is_available=True,
                    name="Arroz Goya 10 LB",
                    brand="GOYA_CATALOG_TEST",
                    size_text="10 LB",
                )
            )
            db_session.flush()

    def _get(self, db_session, user_id, query=""):  # type: ignore[no-untyped-def]
        app.dependency_overrides[get_session] = lambda: db_session
        app.dependency_overrides[get_current_user_id] = lambda: user_id
        try:
            with TestClient(app) as c:
                return c.get(f"/v1/admin/save/canonical-products{query}")
        finally:
            app.dependency_overrides.clear()

    def test_returns_the_canonical_with_derived_metrics(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """El listado incluye matched_provider_count derivado de store_product.canonical_product_id."""
        user_id = _seed_role_user(db_session, "super_admin")
        self._seed_catalog(db_session)

        # Filtrar por el canónico específico para evitar datos residuales
        res = self._get(db_session, user_id, "?search=Catalog+Test")

        assert res.status_code == 200, res.text
        body = res.json()
        assert body["total"] >= 1
        # Encontrar nuestro canónico específico
        row = next((r for r in body["rows"] if r["canonical_product_id"] == self.CANONICAL_ID), None)
        assert row is not None, "El canónico sembrado no aparece en los resultados"
        assert row["slug"] == "arroz-goya-catalog-test"
        assert row["name"] == "Arroz Goya Catalog Test"
        assert row["brand"] == "GOYA_CATALOG_TEST"
        assert row["display_size"] == "10 LB"
        assert row["image_url"] == "https://example.com/arroz.jpg"
        assert row["matched_provider_count"] == 1  # Derivado de store_product
        assert row["ean_reachable"] is True  # Derivado de store_product.ean
        assert row["origin_run_id"] == "run-123"

    def test_pagination_works(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Limit y offset funcionan para paginación del lado del cliente."""
        user_id = _seed_role_user(db_session, "super_admin")
        self._seed_catalog(db_session)

        res = self._get(db_session, user_id, "?limit=10&offset=0&search=Catalog+Test")

        assert res.status_code == 200
        body = res.json()
        assert body["total"] >= 1
        assert len(body["rows"]) >= 1
        # Verificar que nuestro canónico está en los resultados
        assert any(r["canonical_product_id"] == self.CANONICAL_ID for r in body["rows"])

    def test_search_by_name_filters_results(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Search por nombre filtra los resultados (ILIKE)."""
        user_id = _seed_role_user(db_session, "super_admin")
        self._seed_catalog(db_session)

        # Search que matchea (usar término específico para evitar falsos positivos)
        res = self._get(db_session, user_id, "?search=Catalog+Test")
        assert res.status_code == 200
        assert res.json()["total"] >= 1
        # Verificar que nuestro canónico está en los resultados
        assert any(r["canonical_product_id"] == self.CANONICAL_ID for r in res.json()["rows"])

        # Search que no matchea (usar término muy específico)
        res = self._get(db_session, user_id, "?search=XYZ123NoExiste")
        assert res.status_code == 200
        assert res.json()["total"] == 0

    def test_filter_by_brand_id(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Filtro por brand_id devuelve solo canónicos de esa marca."""
        user_id = _seed_role_user(db_session, "super_admin")
        self._seed_catalog(db_session)

        res = self._get(db_session, user_id, f"?brand_id={self.BRAND_ID}")
        assert res.status_code == 200
        # Verificar que nuestro canónico está en los resultados
        assert any(r["canonical_product_id"] == self.CANONICAL_ID for r in res.json()["rows"])

        # Brand que no existe
        res = self._get(db_session, user_id, "?brand_id=99999999-9999-4999-8999-999999999999")
        assert res.status_code == 200
        assert res.json()["total"] == 0

    def test_filter_by_taxonomy_node_id(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Filtro por taxonomy_node_id devuelve solo canónicos de esa categoría."""
        user_id = _seed_role_user(db_session, "super_admin")
        self._seed_catalog(db_session)

        res = self._get(db_session, user_id, f"?taxonomy_node_id={self.TAXONOMY_ID}")
        assert res.status_code == 200
        # Verificar que nuestro canónico está en los resultados
        assert any(r["canonical_product_id"] == self.CANONICAL_ID for r in res.json()["rows"])

    def test_quality_statuses_are_derived(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """quality_statuses es una lista derivada de la completitud de los campos."""
        user_id = _seed_role_user(db_session, "super_admin")
        self._seed_catalog(db_session)

        # Filtrar por el canónico específico
        res = self._get(db_session, user_id, "?search=Catalog+Test")
        assert res.status_code == 200
        row = next((r for r in res.json()["rows"] if r["canonical_product_id"] == self.CANONICAL_ID), None)
        assert row is not None
        # El canónico sembrado tiene todos los campos → "complete"
        assert "complete" in row["quality_statuses"]

    def test_completeness_score_is_percentage(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """completeness_score es un porcentaje 0-100 derivado de campos presentes."""
        user_id = _seed_role_user(db_session, "super_admin")
        self._seed_catalog(db_session)

        # Filtrar por el canónico específico
        res = self._get(db_session, user_id, "?search=Catalog+Test")
        assert res.status_code == 200
        row = next((r for r in res.json()["rows"] if r["canonical_product_id"] == self.CANONICAL_ID), None)
        assert row is not None
        # El canónico sembrado tiene la mayoría de los campos → score razonable
        # (6 campos ponderados: image, category, providers, brand, display_size, quality)
        assert row["completeness_score"] >= 50


class TestCanonicalProductProviders:
    """GET /admin/save/canonical-products/{id}/providers — modal de proveedores (US-CP-L4)."""

    MARKET_ID = "DO"
    PROVIDER_ID = "66666666-6666-4666-8666-666666666666"
    BRAND_ID = "77777777-7777-4777-8777-777777777777"
    TAXONOMY_ID = "88888888-8888-4888-8888-888888888888"
    CANONICAL_ID = "99999999-9999-4999-8999-999999999999"
    STORE_PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

    def _seed_catalog(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Siembra un canónico con 1 store_product para verificar el modal de proveedores."""
        from sqlalchemy import select as sa_select

        # Provider
        existing = db_session.scalars(
            sa_select(ProviderModel).where(ProviderModel.id == self.PROVIDER_ID)
        ).first()
        if not existing:
            db_session.add(
                ProviderModel(
                    id=self.PROVIDER_ID, name="Sirena Providers Test", type="supermarket",
                    platform="vtex", market_id=self.MARKET_ID,
                )
            )
            db_session.flush()

        # Brand
        existing_brand = db_session.scalars(
            sa_select(BrandModel).where(
                BrandModel.market_id == self.MARKET_ID,
                BrandModel.name == "GOYA_PROVIDERS_TEST",
            )
        ).first()
        if existing_brand:
            brand_id = existing_brand.id
        else:
            brand = BrandModel(
                id=self.BRAND_ID, name="GOYA_PROVIDERS_TEST", market_id=self.MARKET_ID,
            )
            db_session.add(brand)
            db_session.flush()
            brand_id = brand.id

        # Taxonomy leaf
        existing_tax = db_session.scalars(
            sa_select(TaxonomyNodeModel).where(TaxonomyNodeModel.id == self.TAXONOMY_ID)
        ).first()
        if not existing_tax:
            db_session.add(
                taxonomy_node(db_session, 
                    id=self.TAXONOMY_ID, name="Arroz Providers Test", level=1,
                    market_id=self.MARKET_ID, parent_id=None,
                )
            )
            db_session.flush()

        # Canonical product
        existing_cp = db_session.scalars(
            sa_select(CanonicalProductModel).where(CanonicalProductModel.id == self.CANONICAL_ID)
        ).first()
        if not existing_cp:
            db_session.add(
                CanonicalProductModel(
                    id=self.CANONICAL_ID,
                    slug="arroz-goya-providers-test",
                    name="Arroz Goya Providers Test",
                    brand_id=brand_id,
                    quality="premium",
                    display_size="10 LB",
                    image_url="https://example.com/arroz.jpg",
                    size_amount=Decimal("10.0"),
                    size_measure="mass",
                    taxonomy_node_id=self.TAXONOMY_ID,
                    market_id=self.MARKET_ID,
                )
            )
            db_session.flush()

        # Store product
        existing_sp = db_session.scalars(
            sa_select(StoreProductModel).where(StoreProductModel.id == self.STORE_PRODUCT_ID)
        ).first()
        if not existing_sp:
            db_session.add(
                StoreProductModel(
                    id=self.STORE_PRODUCT_ID,
                    provider_id=self.PROVIDER_ID,
                    canonical_product_id=self.CANONICAL_ID,
                    external_id="ext-providers-test-123",
                    current_price_minor=15000,  # RD$ 150.00
                    currency="DOP",
                    url="https://sirena.do/arroz-goya",
                    ean="041383001234",
                    last_seen_at=datetime.now(UTC),
                    is_available=True,
                    name="Arroz Goya 10 LB",
                    brand="GOYA_PROVIDERS_TEST",
                    size_text="10 LB",
                )
            )
            db_session.flush()

    def _get(self, db_session, user_id, canonical_id):  # type: ignore[no-untyped-def]
        app.dependency_overrides[get_session] = lambda: db_session
        app.dependency_overrides[get_current_user_id] = lambda: user_id
        try:
            with TestClient(app) as c:
                return c.get(f"/v1/admin/save/canonical-products/{canonical_id}/providers")
        finally:
            app.dependency_overrides.clear()

    def test_returns_providers_with_prices(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """El modal devuelve la lista de proveedores con precios ordenados por precio ascendente."""
        user_id = _seed_role_user(db_session, "super_admin")
        self._seed_catalog(db_session)

        res = self._get(db_session, user_id, self.CANONICAL_ID)

        assert res.status_code == 200, res.text
        body = res.json()
        assert len(body) >= 1
        # Encontrar nuestro provider específico
        provider = next((p for p in body if p["provider_id"] == self.PROVIDER_ID), None)
        assert provider is not None, "El provider sembrado no aparece en los resultados"
        assert provider["provider_name"] == "Sirena Providers Test"
        assert provider["price_minor"] == 15000
        assert provider["currency"] == "DOP"
        assert provider["url"] == "https://sirena.do/arroz-goya"
        assert provider["is_cheapest"] is True  # Solo hay 1 provider, así que es el más barato

    def test_unknown_canonical_returns_404(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Un canónico inexistente devuelve 404."""
        user_id = _seed_role_user(db_session, "super_admin")

        res = self._get(db_session, user_id, "00000000-0000-4000-8000-000000000000")

        assert res.status_code == 404


class TestCanonicalProviderPreviousPrice:
    """`previous_price_minor` por tienda — el tachado y el `-N%` del detalle (rediseño Figma).

    Se DERIVA de `save.price`, que es append-only: el precio anterior es la última observación
    cuyo valor DIFIERE del vigente. No hay columna nueva ni migración.

    La distinción importa: la ingesta escribe una fila por corrida aunque el precio no se mueva,
    así que "la penúltima fila" casi siempre es el MISMO precio de hoy. Tacharlo mostraría
    "$74 antes $74", que no es un descuento — es ruido de la ingesta.
    """

    MARKET_ID = "DO"
    PROVIDER_ID = "66666666-6666-4666-8666-666666666667"
    BRAND_ID = "77777777-7777-4777-8777-777777777778"
    TAXONOMY_ID = "88888888-8888-4888-8888-888888888889"
    CANONICAL_ID = "99999999-9999-4999-8999-99999999999a"
    STORE_PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab"

    def _seed(self, db_session, price_history: list[tuple[int, int]]) -> None:  # type: ignore[no-untyped-def]
        """Siembra el canónico + 1 tienda y su histórico.

        `price_history` es una lista de `(value_minor, days_ago)`; se inserta tal cual en
        `save.price`. El precio VIGENTE es `current_price_minor` del store_product.
        """
        from sqlalchemy import select as sa_select

        from src.contexts.save.infrastructure.models import PriceModel

        if not db_session.scalars(
            sa_select(ProviderModel).where(ProviderModel.id == self.PROVIDER_ID)
        ).first():
            db_session.add(
                ProviderModel(
                    id=self.PROVIDER_ID, name="Sirena Prev Price", type="supermarket",
                    platform="vtex", market_id=self.MARKET_ID,
                )
            )
            db_session.flush()

        brand = db_session.scalars(
            sa_select(BrandModel).where(
                BrandModel.market_id == self.MARKET_ID, BrandModel.name == "GOYA_PREV_PRICE",
            )
        ).first()
        if brand:
            brand_id = brand.id
        else:
            brand = BrandModel(id=self.BRAND_ID, name="GOYA_PREV_PRICE", market_id=self.MARKET_ID)
            db_session.add(brand)
            db_session.flush()
            brand_id = brand.id

        if not db_session.scalars(
            sa_select(TaxonomyNodeModel).where(TaxonomyNodeModel.id == self.TAXONOMY_ID)
        ).first():
            db_session.add(
                taxonomy_node(db_session, 
                    id=self.TAXONOMY_ID, name="Arroz Prev Price", level=1,
                    market_id=self.MARKET_ID, parent_id=None,
                )
            )
            db_session.flush()

        if not db_session.scalars(
            sa_select(CanonicalProductModel).where(CanonicalProductModel.id == self.CANONICAL_ID)
        ).first():
            db_session.add(
                CanonicalProductModel(
                    id=self.CANONICAL_ID, slug="arroz-goya-prev-price",
                    name="Arroz Goya Prev Price", brand_id=brand_id, quality="premium",
                    display_size="10 LB", image_url="https://example.com/arroz.jpg",
                    size_amount=Decimal("10.0"), size_measure="mass",
                    taxonomy_node_id=self.TAXONOMY_ID, market_id=self.MARKET_ID,
                )
            )
            db_session.flush()

        current = price_history[0][0]
        if not db_session.scalars(
            sa_select(StoreProductModel).where(StoreProductModel.id == self.STORE_PRODUCT_ID)
        ).first():
            db_session.add(
                StoreProductModel(
                    id=self.STORE_PRODUCT_ID, provider_id=self.PROVIDER_ID,
                    canonical_product_id=self.CANONICAL_ID, external_id="ext-prev-price-1",
                    current_price_minor=current, currency="DOP",
                    url="https://sirena.do/arroz-goya-prev", ean="041383009999",
                    last_seen_at=datetime.now(UTC), is_available=True,
                    name="Arroz Goya 10 LB", brand="GOYA_PREV_PRICE", size_text="10 LB",
                )
            )
            db_session.flush()

        for value_minor, days_ago in price_history:
            db_session.add(
                PriceModel(
                    store_product_id=self.STORE_PRODUCT_ID, value_minor=value_minor,
                    currency="DOP", captured_at=datetime.now(UTC) - timedelta(days=days_ago),
                    price_type="online", source="test",
                )
            )
        db_session.flush()

    def _get(self, db_session, user_id):  # type: ignore[no-untyped-def]
        app.dependency_overrides[get_session] = lambda: db_session
        app.dependency_overrides[get_current_user_id] = lambda: user_id
        try:
            with TestClient(app) as c:
                return c.get(
                    f"/v1/admin/save/canonical-products/{self.CANONICAL_ID}/providers"
                )
        finally:
            app.dependency_overrides.clear()

    def test_previous_price_is_last_different_value(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """El precio anterior salta las observaciones que repiten el precio vigente.

        Histórico: 9500 (hace 10d) → 7400 (hace 3d) → 7400 (hoy, la corrida de ayer no movió
        nada). El anterior es 9500, no 7400.
        """
        user_id = _seed_role_user(db_session, "super_admin")
        self._seed(db_session, [(7400, 0), (7400, 3), (9500, 10)])

        res = self._get(db_session, user_id)

        assert res.status_code == 200, res.text
        provider = next(
            (p for p in res.json() if p["store_product_id"] == self.STORE_PRODUCT_ID), None
        )
        assert provider is not None
        assert provider["price_minor"] == 7400
        assert provider["previous_price_minor"] == 9500

    def test_previous_price_is_null_without_a_different_observation(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Sin ninguna observación distinta al precio vigente, el anterior es `None`.

        Un producto que nunca cambió de precio NO tiene tachado. Devolver el mismo número haría
        que la UI pintara "antes $74" al lado de "$74".
        """
        user_id = _seed_role_user(db_session, "super_admin")
        self._seed(db_session, [(7400, 0), (7400, 5)])

        res = self._get(db_session, user_id)

        assert res.status_code == 200, res.text
        provider = next(
            (p for p in res.json() if p["store_product_id"] == self.STORE_PRODUCT_ID), None
        )
        assert provider is not None
        assert provider["previous_price_minor"] is None


class TestCreateCanonicalProduct:
    """POST /admin/save/canonical-products — alta manual (US-CP-L7)."""

    MARKET_ID = "DO"

    def _post(self, db_session, user_id, body):  # type: ignore[no-untyped-def]
        app.dependency_overrides[get_session] = lambda: db_session
        app.dependency_overrides[get_current_user_id] = lambda: user_id
        try:
            with TestClient(app) as c:
                return c.post("/v1/admin/save/canonical-products", json=body)
        finally:
            app.dependency_overrides.clear()

    def test_creates_canonical_with_required_fields(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Alta manual con campos obligatorios (name, size_amount, size_measure)."""
        user_id = _seed_role_user(db_session, "super_admin")

        body = {
            "name": "Leche Entera Test",
            "brand": "GLORIA",
            "size_amount": 1.0,
            "size_measure": "volume",
            "quality": "premium",
            "display_size": "1 L",
        }

        res = self._post(db_session, user_id, body)

        assert res.status_code == 201, res.text
        data = res.json()
        assert data["name"] == "Leche Entera Test"
        assert data["brand"] == "GLORIA"
        assert float(data["size_amount"]) == 1.0
        assert data["size_measure"] == "volume"
        assert data["slug"]  # Slug generado automáticamente
        assert data["canonical_product_id"]  # UUID generado

    def test_creates_canonical_with_optional_fields(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Alta manual con campos opcionales (taxonomy_node_id, image_url)."""
        user_id = _seed_role_user(db_session, "super_admin")

        body = {
            "name": "Arroz Blanco Test",
            "brand": "COSTA",
            "size_amount": 5.0,
            "size_measure": "mass",
            "quality": "standard",
            "display_size": "5 KG",
            "image_url": "https://example.com/arroz.jpg",
        }

        res = self._post(db_session, user_id, body)

        assert res.status_code == 201, res.text
        data = res.json()
        assert data["image_url"] == "https://example.com/arroz.jpg"
        # quality se usa internamente para derivar quality_statuses, no se expone en el DTO

    def test_missing_required_fields_returns_422(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Faltan campos obligatorios (name, size_amount, size_measure)."""
        user_id = _seed_role_user(db_session, "super_admin")

        body = {
            "name": "Producto Incompleto",
            # Falta size_amount y size_measure
        }

        res = self._post(db_session, user_id, body)

        assert res.status_code == 422

    def test_slug_is_unique_per_market(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Si el slug ya existe, se genera uno único (sufijo -2, -3, etc.)."""
        user_id = _seed_role_user(db_session, "super_admin")

        # Crear primer canónico
        body1 = {
            "name": "Producto Slug Único Test",
            "brand": "MARCA_SLUG",
            "size_amount": 1.0,
            "size_measure": "count",
        }
        res1 = self._post(db_session, user_id, body1)
        assert res1.status_code == 201
        slug1 = res1.json()["slug"]
        
        # Hacer commit para que el primer producto sea visible en la base de datos
        db_session.commit()

        # Crear segundo canónico con mismo nombre/marca/tamaño
        body2 = {
            "name": "Producto Slug Único Test",
            "brand": "MARCA_SLUG",
            "size_amount": 1.0,
            "size_measure": "count",
        }
        res2 = self._post(db_session, user_id, body2)
        assert res2.status_code == 201
        slug2 = res2.json()["slug"]

        # Los slugs deben ser diferentes
        assert slug1 != slug2
        assert slug2.endswith("-2")




# ---------------------------------------------------------------------------- helpers comunes --


def _override(db_session, user_id):  # type: ignore[no-untyped-def]
    app.dependency_overrides[get_session] = lambda: db_session
    app.dependency_overrides[get_current_user_id] = lambda: user_id


def _call(db_session, user_id, method: str, path: str, json=None):  # type: ignore[no-untyped-def]
    _override(db_session, user_id)
    try:
        with TestClient(app) as c:
            kwargs = {"json": json} if json is not None else {}
            return getattr(c, method)(f"/v1/admin/save{path}", **kwargs)
    finally:
        app.dependency_overrides.clear()


class TestCreateReturnsTheProductItActuallyCreated:
    """REGRESIÓN — la versión anterior persistía y después re-consultaba por NOMBRE con
    `ORDER BY id DESC LIMIT 1` para "recuperar" lo recién creado.

    Con UUID4 (aleatorio, no ordenable por tiempo) eso devuelve una fila ARBITRARIA cuando hay
    nombres repetidos: la API respondía el id/slug de OTRO producto y la auditoría registraba el
    target equivocado. Este test crea varios canónicos con el MISMO nombre a propósito.
    """

    def test_each_create_returns_its_own_id_and_slug(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "super_admin")
        body = {
            "name": "Producto Homonimo Regresion",
            "brand": "MARCA_REG",
            "size_amount": 1.0,
            "size_measure": "count",
        }

        ids, slugs = [], []
        for _ in range(4):
            res = _call(db_session, user_id, "post", "/canonical-products", body)
            assert res.status_code == 201, res.text
            ids.append(res.json()["canonical_product_id"])
            slugs.append(res.json()["slug"])

        assert len(set(ids)) == 4, f"La API devolvió ids repetidos: {ids}"
        assert len(set(slugs)) == 4, f"La API devolvió slugs repetidos: {slugs}"

    def test_the_returned_id_can_be_fetched_back(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Si el id que devuelve el POST no es el del producto creado, este GET traería otra cosa."""
        user_id = _seed_role_user(db_session, "super_admin")
        created = _call(
            db_session, user_id, "post", "/canonical-products",
            {"name": "Producto Ida Y Vuelta", "brand": "MARCA_IV",
             "size_amount": 2.5, "size_measure": "volume"},
        ).json()

        res = _call(
            db_session, user_id, "get", f"/canonical-products/{created['canonical_product_id']}"
        )
        assert res.status_code == 200, res.text
        assert res.json()["name"] == "Producto Ida Y Vuelta"
        assert res.json()["slug"] == created["slug"]


class TestBrandIsNormalizedUppercase:
    """US-CP-L7: sin normalizar, `goya`, `Goya` y `GOYA` entran como TRES marcas distintas en
    `save.brand` (unicidad por mercado+nombre) y el filtro por marca deja de servir."""

    def test_a_lowercase_brand_is_persisted_uppercase(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "super_admin")
        res = _call(
            db_session, user_id, "post", "/canonical-products",
            {"name": "Aceite Normalizacion", "brand": "  mazola  ",
             "size_amount": 1, "size_measure": "volume"},
        )
        assert res.status_code == 201, res.text
        assert res.json()["brand"] == "MAZOLA"


class TestUpdateCanonicalProduct:
    """PATCH /canonical-products/{id} — Batch 8 (US-CP-L5/D2)."""

    def _create(self, db_session, user_id, name="Producto Editable"):  # type: ignore[no-untyped-def]
        return _call(
            db_session, user_id, "post", "/canonical-products",
            {"name": name, "brand": "MARCA_EDIT", "size_amount": 1, "size_measure": "count"},
        ).json()

    def test_updates_the_name(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "super_admin")
        created = self._create(db_session, user_id)
        res = _call(
            db_session, user_id, "patch",
            f"/canonical-products/{created['canonical_product_id']}",
            {"name": "Producto Ya Editado"},
        )
        assert res.status_code == 200, res.text
        assert res.json()["name"] == "Producto Ya Editado"

    def test_the_slug_stays_stable_when_the_name_changes(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """US-CP-D2b: el slug es la llave PÚBLICA del producto. Regenerarlo al editar el nombre
        rompería enlaces compartidos y el canonical SEO en silencio."""
        user_id = _seed_role_user(db_session, "super_admin")
        created = self._create(db_session, user_id, "Producto Slug Estable")
        res = _call(
            db_session, user_id, "patch",
            f"/canonical-products/{created['canonical_product_id']}",
            {"name": "Nombre Completamente Distinto"},
        )
        assert res.status_code == 200, res.text
        assert res.json()["slug"] == created["slug"]

    def test_an_edited_brand_is_uppercased(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "super_admin")
        created = self._create(db_session, user_id, "Producto Marca Editada")
        res = _call(
            db_session, user_id, "patch",
            f"/canonical-products/{created['canonical_product_id']}",
            {"brand": "la famosa"},
        )
        assert res.status_code == 200, res.text
        assert res.json()["brand"] == "LA FAMOSA"

    def test_changing_size_needs_both_fields(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Mandar sólo la cantidad dejaría el producto con un tamaño incoherente con su unidad."""
        user_id = _seed_role_user(db_session, "super_admin")
        created = self._create(db_session, user_id, "Producto Tamano Parcial")
        res = _call(
            db_session, user_id, "patch",
            f"/canonical-products/{created['canonical_product_id']}",
            {"size_amount": 5},
        )
        assert res.status_code == 422

    def test_an_unknown_id_is_404(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "super_admin")
        res = _call(
            db_session, user_id, "patch",
            "/canonical-products/99999999-9999-4999-8999-999999999999",
            {"name": "No existe"},
        )
        assert res.status_code == 404

    def test_the_edit_is_audited(self, db_session) -> None:  # type: ignore[no-untyped-def]
        from src.contexts.save.infrastructure.models import AdminAuditLogModel
        from sqlalchemy import select as sa_select

        user_id = _seed_role_user(db_session, "super_admin")
        created = self._create(db_session, user_id, "Producto Auditado Edit")
        _call(
            db_session, user_id, "patch",
            f"/canonical-products/{created['canonical_product_id']}",
            {"name": "Producto Auditado Edit v2"},
        )
        rows = db_session.scalars(
            sa_select(AdminAuditLogModel).where(
                AdminAuditLogModel.target_id == created["canonical_product_id"],
                AdminAuditLogModel.action == "canonical_product.update",
            )
        ).all()
        assert len(rows) == 1, "La edición del catálogo TIENE que dejar auditoría (T2)"


class TestImportPreview:
    """POST /canonical-products/import/preview — paso 2 del import (US-CP-L8).

    El SDD manda tres pasos (cargar → previsualizar → confirmar). El preview NO puede persistir
    nada: su valor entero es poder decir qué va a pasar ANTES de que pase.
    """

    def test_valid_rows_are_reported_as_valid(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "super_admin")
        res = _call(
            db_session, user_id, "post", "/canonical-products/import/preview",
            {"rows": [
                {"name": "Leche Preview", "brand": "gloria",
                 "size_amount": "1", "size_measure": "volume"},
                {"name": "Arroz Preview", "brand": "costa",
                 "size_amount": "5", "size_measure": "mass"},
            ]},
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["valid_count"] == 2
        assert data["invalid_count"] == 0
        assert data["valid_rows"][0]["brand"] == "GLORIA"

    def test_an_invalid_row_names_the_offending_field(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "super_admin")
        res = _call(
            db_session, user_id, "post", "/canonical-products/import/preview",
            {"rows": [
                {"name": "Fila Buena", "size_amount": "1", "size_measure": "count"},
                {"name": "Fila Mala", "size_amount": "1", "size_measure": "kilos"},
            ]},
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["valid_count"] == 1
        assert data["invalid_count"] == 1
        assert data["invalid_rows"][0]["field"] == "size_measure"
        assert data["invalid_rows"][0]["row_index"] == 1

    def test_a_duplicate_inside_the_file_is_warned(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "super_admin")
        row = {"name": "Repetida Preview", "brand": "X",
               "size_amount": "1", "size_measure": "count"}
        res = _call(
            db_session, user_id, "post", "/canonical-products/import/preview",
            {"rows": [row, row]},
        )
        assert res.status_code == 200, res.text
        assert len(res.json()["warnings"]) == 1

    def test_a_product_that_already_exists_is_warned(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Sin esto, reimportar el mismo CSV duplica el catálogo entero en silencio."""
        user_id = _seed_role_user(db_session, "super_admin")
        _call(
            db_session, user_id, "post", "/canonical-products",
            {"name": "Ya Existe En Catalogo", "brand": "EXISTE",
             "size_amount": 1, "size_measure": "count"},
        )
        res = _call(
            db_session, user_id, "post", "/canonical-products/import/preview",
            {"rows": [{"name": "Ya Existe En Catalogo", "brand": "existe",
                       "size_amount": "1", "size_measure": "count"}]},
        )
        assert res.status_code == 200, res.text
        assert len(res.json()["warnings"]) == 1
        assert "Ya existe" in res.json()["warnings"][0]["message"]

    def test_preview_persists_nothing(self, db_session) -> None:  # type: ignore[no-untyped-def]
        from sqlalchemy import func as sa_func, select as sa_select

        user_id = _seed_role_user(db_session, "super_admin")
        before = db_session.scalar(sa_select(sa_func.count()).select_from(CanonicalProductModel))
        _call(
            db_session, user_id, "post", "/canonical-products/import/preview",
            {"rows": [{"name": "No Debe Persistir", "size_amount": "1",
                       "size_measure": "count"}]},
        )
        after = db_session.scalar(sa_select(sa_func.count()).select_from(CanonicalProductModel))
        assert after == before, "El PREVIEW no puede escribir en la base"

    def test_empty_rows_is_valid_and_empty(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "super_admin")
        res = _call(
            db_session, user_id, "post", "/canonical-products/import/preview", {"rows": []}
        )
        assert res.status_code == 200
        assert res.json()["valid_count"] == 0


class TestImportCommit:
    """POST /canonical-products/import/commit — paso 3 del import (US-CP-L8)."""

    def test_valid_rows_are_persisted(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "super_admin")
        res = _call(
            db_session, user_id, "post", "/canonical-products/import/commit",
            {"rows": [
                {"name": "Leche Commit", "brand": "gloria",
                 "size_amount": "1", "size_measure": "volume", "display_size": "1 L"},
                {"name": "Arroz Commit", "brand": "costa",
                 "size_amount": "5", "size_measure": "mass"},
            ]},
        )
        assert res.status_code == 201, res.text
        data = res.json()
        assert data["imported_count"] == 2
        assert data["error_count"] == 0
        assert {r["name"] for r in data["imported"]} == {"Leche Commit", "Arroz Commit"}
        assert data["imported"][0]["brand"] in ("GLORIA", "COSTA")

    def test_an_invalid_row_does_not_block_the_valid_ones(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """La fila mala se reporta; las buenas entran igual. Perder la importación completa por
        una celda mal escrita obligaría al operador a rehacer todo el archivo."""
        user_id = _seed_role_user(db_session, "super_admin")
        res = _call(
            db_session, user_id, "post", "/canonical-products/import/commit",
            {"rows": [
                {"name": "Valida Commit", "size_amount": "1", "size_measure": "count"},
                {"name": "Invalida Commit", "size_amount": "1", "size_measure": "invalid_unit"},
                {"name": "Valida Commit 2", "size_amount": "2", "size_measure": "count"},
            ]},
        )
        assert res.status_code == 201, res.text
        data = res.json()
        assert data["imported_count"] == 2
        assert data["error_count"] == 1
        assert data["errors"][0]["row_index"] == 1

    def test_each_imported_row_is_audited_as_bulk_import(self, db_session) -> None:  # type: ignore[no-untyped-def]
        from src.contexts.save.infrastructure.models import AdminAuditLogModel
        from sqlalchemy import select as sa_select

        user_id = _seed_role_user(db_session, "super_admin")
        res = _call(
            db_session, user_id, "post", "/canonical-products/import/commit",
            {"rows": [{"name": "Auditada Import", "size_amount": "1",
                       "size_measure": "count"}]},
        )
        target = res.json()["imported"][0]["canonical_product_id"]
        rows = db_session.scalars(
            sa_select(AdminAuditLogModel).where(AdminAuditLogModel.target_id == target)
        ).all()
        assert len(rows) == 1
        assert rows[0].action == "canonical_product.import"
        assert rows[0].payload_summary["origin"] == "bulk_import"

    def test_empty_rows_imports_nothing(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "super_admin")
        res = _call(
            db_session, user_id, "post", "/canonical-products/import/commit", {"rows": []}
        )
        assert res.status_code == 201
        assert res.json()["imported_count"] == 0
        assert res.json()["error_count"] == 0


class TestCategoryCarriesLeafAndTop:
    """La lista muestra la HOJA ("Arroz") y colorea el badge por el TOPE ("Despensa & Abarrotes").

    Antes de esto la fila sólo traía la hoja, y el admin la pasaba como si fuera el slug: el mapa
    de colores está cargado por slug de TOPE, así que ninguna categoría resolvía color y TODOS los
    badges salían grises. El slug se deriva en read-time — `taxonomy_node` no tiene columna slug.
    """

    MARKET_ID = "DO"
    BRAND_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    TOP_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    LEAF_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
    CANONICAL_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
    ORPHAN_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff"

    def _seed(self, db_session) -> None:  # type: ignore[no-untyped-def]
        db_session.add(
            BrandModel(id=self.BRAND_ID, name="LEAFTOP_TEST", market_id=self.MARKET_ID)
        )
        db_session.add(
            taxonomy_node(db_session, 
                id=self.TOP_ID, name="Despensa & Abarrotes", level=0,
                market_id=self.MARKET_ID, parent_id=None,
            )
        )
        db_session.add(
            taxonomy_node(db_session, 
                id=self.LEAF_ID, name="Arroz LeafTop", level=1,
                market_id=self.MARKET_ID, parent_id=self.TOP_ID,
            )
        )
        db_session.flush()
        db_session.add(
            CanonicalProductModel(
                id=self.CANONICAL_ID, slug="arroz-leaftop-test", name="Arroz LeafTop Test",
                brand_id=self.BRAND_ID, size_amount=Decimal("1.0"), size_measure="mass",
                taxonomy_node_id=self.LEAF_ID, market_id=self.MARKET_ID,
            )
        )
        # Sin clasificar: NO debe inventar tope ni slug.
        db_session.add(
            CanonicalProductModel(
                id=self.ORPHAN_ID, slug="sin-categoria-leaftop", name="Sin Categoria LeafTop",
                brand_id=self.BRAND_ID, size_amount=Decimal("1.0"), size_measure="mass",
                taxonomy_node_id=None, market_id=self.MARKET_ID,
            )
        )
        db_session.flush()

    def _rows(self, db_session, user_id):  # type: ignore[no-untyped-def]
        app.dependency_overrides[get_session] = lambda: db_session
        app.dependency_overrides[get_current_user_id] = lambda: user_id
        try:
            with TestClient(app) as c:
                res = c.get("/v1/admin/save/canonical-products?search=LeafTop")
        finally:
            app.dependency_overrides.clear()
        assert res.status_code == 200, res.text
        return {r["canonical_product_id"]: r for r in res.json()["rows"]}

    def test_the_row_carries_the_leaf_the_top_and_the_derived_slug(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "super_admin")
        self._seed(db_session)

        row = self._rows(db_session, user_id)[self.CANONICAL_ID]

        assert row["category"] == "Arroz LeafTop"
        assert row["category_top"] == "Despensa & Abarrotes"
        # El slug es lo que hace que el badge tenga color — sin él sale gris.
        assert row["category_top_slug"] == "despensa-abarrotes"

    def test_an_unclassified_canonical_invents_nothing(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "super_admin")
        self._seed(db_session)

        row = self._rows(db_session, user_id)[self.ORPHAN_ID]

        assert row["category"] is None
        assert row["category_top"] is None
        assert row["category_top_slug"] is None

    def test_the_detail_agrees_with_the_list(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Que el detalle y la lista discrepen en la categoría es incoherencia que quema confianza."""
        user_id = _seed_role_user(db_session, "super_admin")
        self._seed(db_session)
        listed = self._rows(db_session, user_id)[self.CANONICAL_ID]

        app.dependency_overrides[get_session] = lambda: db_session
        app.dependency_overrides[get_current_user_id] = lambda: user_id
        try:
            with TestClient(app) as c:
                res = c.get(f"/v1/admin/save/canonical-products/{self.CANONICAL_ID}")
        finally:
            app.dependency_overrides.clear()

        assert res.status_code == 200, res.text
        detail = res.json()
        assert detail["category"] == listed["category"]
        assert detail["category_top"] == listed["category_top"]
        assert detail["category_top_slug"] == listed["category_top_slug"]


class TestEanCodeAndPriceRange:
    """La fila trae el CÓDIGO de barras y el rango de precio entre sus tiendas.

    MIN/MAX se calculan sobre todas las tiendas enlazadas —el mismo universo que el modal de
    proveedores que se abre desde esta fila—, así que columna y drill-down no pueden contradecirse.
    """

    MARKET_ID = "DO"
    BRAND_ID = "1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a"
    PROVIDER_A = "2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b"
    PROVIDER_B = "3c3c3c3c-3c3c-4c3c-8c3c-3c3c3c3c3c3c"
    CANONICAL_ID = "4d4d4d4d-4d4d-4d4d-8d4d-4d4d4d4d4d4d"
    LONELY_ID = "5e5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5e"

    def _seed(self, db_session) -> None:  # type: ignore[no-untyped-def]
        db_session.add(BrandModel(id=self.BRAND_ID, name="PRICERANGE_TEST", market_id=self.MARKET_ID))
        for pid, name in ((self.PROVIDER_A, "PriceRange A"), (self.PROVIDER_B, "PriceRange B")):
            db_session.add(
                ProviderModel(
                    id=pid, name=name, type="supermarket", platform="vtex",
                    market_id=self.MARKET_ID,
                )
            )
        for cid, slug in ((self.CANONICAL_ID, "con-tiendas"), (self.LONELY_ID, "sin-tiendas")):
            db_session.add(
                CanonicalProductModel(
                    id=cid, slug=f"{slug}-pricerange", name=f"PriceRange {slug}",
                    brand_id=self.BRAND_ID, size_amount=Decimal("1.0"), size_measure="mass",
                    market_id=self.MARKET_ID,
                )
            )
        db_session.flush()
        # Dos tiendas, precios distintos: 150.00 y 210.50 (minor units).
        for i, (pid, price) in enumerate(((self.PROVIDER_A, 15000), (self.PROVIDER_B, 21050))):
            db_session.add(
                StoreProductModel(
                    provider_id=pid, canonical_product_id=self.CANONICAL_ID,
                    external_id=f"ext-pricerange-{i}", current_price_minor=price, currency="DOP",
                    ean="7501234567890" if i == 0 else "", last_seen_at=datetime.now(UTC),
                    is_available=True, name=f"PriceRange SP {i}", size_text="1 Kg",
                )
            )
        db_session.flush()

    def _rows(self, db_session, user_id):  # type: ignore[no-untyped-def]
        app.dependency_overrides[get_session] = lambda: db_session
        app.dependency_overrides[get_current_user_id] = lambda: user_id
        try:
            with TestClient(app) as c:
                res = c.get("/v1/admin/save/canonical-products?search=PriceRange")
        finally:
            app.dependency_overrides.clear()
        assert res.status_code == 200, res.text
        return {r["canonical_product_id"]: r for r in res.json()["rows"]}

    def test_the_row_carries_the_min_and_max_price_in_minor_units(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "super_admin")
        self._seed(db_session)

        row = self._rows(db_session, user_id)[self.CANONICAL_ID]

        assert row["min_price_minor"] == 15000
        assert row["max_price_minor"] == 21050
        assert row["price_currency"] == "DOP"

    def test_the_barcode_travels_not_just_the_boolean(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Una etiqueta que sólo dice "EAN" no le sirve al operador: necesita el código para
        buscarlo fuera del admin. El `nullif` evita que el string vacío de la otra tienda gane."""
        user_id = _seed_role_user(db_session, "super_admin")
        self._seed(db_session)

        row = self._rows(db_session, user_id)[self.CANONICAL_ID]

        assert row["ean_reachable"] is True
        assert row["ean"] == "7501234567890"

    def test_a_canonical_without_stores_invents_no_price(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """NULL y no 0: un cero se leería como "gratis" en vez de "todavía nadie lo vende"."""
        user_id = _seed_role_user(db_session, "super_admin")
        self._seed(db_session)

        row = self._rows(db_session, user_id)[self.LONELY_ID]

        assert row["min_price_minor"] is None
        assert row["max_price_minor"] is None
        assert row["ean"] is None
        assert row["ean_reachable"] is False

    def test_quality_no_longer_caps_completeness(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """`quality` salió del denominador: un canónico sin ella puede llegar a 100% y "Completo".
        Antes quedaba clavado en 83% con un badge "Sin calidad" permanente."""
        user_id = _seed_role_user(db_session, "super_admin")
        self._seed(db_session)

        row = self._rows(db_session, user_id)[self.CANONICAL_ID]

        assert "no_quality" not in row["quality_statuses"]


class TestCanonicalProductCursor:
    """GET /admin/save/canonical-products/{id}/cursor — posición + prev/next para el pager (US-CP-D?)."""

    MARKET_ID = "DO"
    PROVIDER_ID = "b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1"
    BRAND_ID = "b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2"
    TAXONOMY_ID = "b3b3b3b3-b3b3-43b3-83b3-b3b3b3b3b3b3"
    CANONICAL_A = "c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1"
    CANONICAL_B = "c2c2c2c2-c2c2-42c2-82c2-c2c2c2c2c2c2"
    CANONICAL_C = "c3c3c3c3-c3c3-43c3-83c3-c3c3c3c3c3c3"
    STORE_A = "d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1"
    STORE_B = "d2d2d2d2-d2d2-42d2-82d2-d2d2d2d2d2d2"
    STORE_C = "d3d3d3d3-d3d3-43d3-83d3-d3d3d3d3d3d3"

    def _seed(self, db_session) -> None:  # type: ignore[no-untyped-def]
        from sqlalchemy import select as sa_select

        existing = db_session.scalars(
            sa_select(ProviderModel).where(ProviderModel.id == self.PROVIDER_ID)
        ).first()
        if not existing:
            db_session.add(
                ProviderModel(
                    id=self.PROVIDER_ID, name="Sirena Cursor Test", type="supermarket",
                    platform="vtex", market_id=self.MARKET_ID,
                )
            )
            db_session.flush()

        existing_brand = db_session.scalars(
            sa_select(BrandModel).where(BrandModel.id == self.BRAND_ID)
        ).first()
        if not existing_brand:
            db_session.add(
                BrandModel(id=self.BRAND_ID, name="CURSOR_BRAND", market_id=self.MARKET_ID)
            )
            db_session.flush()

        existing_tax = db_session.scalars(
            sa_select(TaxonomyNodeModel).where(TaxonomyNodeModel.id == self.TAXONOMY_ID)
        ).first()
        if not existing_tax:
            db_session.add(
                taxonomy_node(db_session, 
                    id=self.TAXONOMY_ID, name="Cursor Category", level=1,
                    market_id=self.MARKET_ID, parent_id=None,
                )
            )
            db_session.flush()

        defaults = {
            "brand_id": self.BRAND_ID,
            "quality": "premium",
            "display_size": "1 LB",
            "image_url": "https://example.com/cursor.jpg",
            "size_amount": Decimal("1.0"),
            "size_measure": "mass",
            "taxonomy_node_id": self.TAXONOMY_ID,
            "market_id": self.MARKET_ID,
        }
        cps = [
            (self.CANONICAL_A, "Cursor Alpha"),
            (self.CANONICAL_B, "Cursor Beta"),
            (self.CANONICAL_C, "Cursor Gamma"),
        ]
        for cp_id, name in cps:
            existing_cp = db_session.scalars(
                sa_select(CanonicalProductModel).where(CanonicalProductModel.id == cp_id)
            ).first()
            if not existing_cp:
                db_session.add(
                    CanonicalProductModel(
                        id=cp_id,
                        slug=name.lower().replace(" ", "-"),
                        name=name,
                        **defaults,
                    )
                )
                db_session.flush()

        # Store products para los 3 canónicos (1 proveedor cada uno).
        for i, cp_id in enumerate((self.CANONICAL_A, self.CANONICAL_B, self.CANONICAL_C)):
            sp_id = getattr(self, ("STORE_A", "STORE_B", "STORE_C")[i])
            existing_sp = db_session.scalars(
                sa_select(StoreProductModel).where(StoreProductModel.id == sp_id)
            ).first()
            if not existing_sp:
                db_session.add(
                    StoreProductModel(
                        id=sp_id,
                        provider_id=self.PROVIDER_ID,
                        canonical_product_id=cp_id,
                        external_id=f"ext-cursor-{i}",
                        current_price_minor=10000 + i * 1000,
                        currency="DOP",
                        ean="123456789012",
                        last_seen_at=datetime.now(UTC),
                        is_available=True,
                        name=f"Cursor SP {i}",
                        size_text="1 LB",
                    )
                )
                db_session.flush()

    def _get(self, db_session, user_id, canonical_id, query=""):  # type: ignore[no-untyped-def]
        app.dependency_overrides[get_session] = lambda: db_session
        app.dependency_overrides[get_current_user_id] = lambda: user_id
        try:
            with TestClient(app) as c:
                return c.get(f"/v1/admin/save/canonical-products/{canonical_id}/cursor{query}")
        finally:
            app.dependency_overrides.clear()

    def test_cursor_returns_position_and_neighbors(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """El canónico del medio tiene position=2, prev del primero y next del tercero."""
        user_id = _seed_role_user(db_session, "super_admin")
        self._seed(db_session)

        res = self._get(db_session, user_id, self.CANONICAL_B, "?sort=name&search=Cursor")
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["total"] == 3
        assert body["position"] == 2
        assert body["previous_id"] == self.CANONICAL_A
        assert body["next_id"] == self.CANONICAL_C

    def test_cursor_respects_search_filter(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Con un search que excluye al primero, el segundo pasa a ser position=1."""
        user_id = _seed_role_user(db_session, "super_admin")
        self._seed(db_session)

        res = self._get(db_session, user_id, self.CANONICAL_B, "?sort=name&search=Cursor+Beta")
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["total"] == 1
        assert body["position"] == 1
        assert body["previous_id"] is None
        assert body["next_id"] is None

    def test_cursor_returns_null_position_when_filtered_out(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Si el producto actual no cumple los filtros, total sigue contando los que sí."""
        user_id = _seed_role_user(db_session, "super_admin")
        self._seed(db_session)

        # Search que no matchea al canónico B pero sí a A y C.
        res = self._get(db_session, user_id, self.CANONICAL_B, "?sort=name&search=Cursor+Gamma")
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["total"] == 1
        assert body["position"] is None
        assert body["previous_id"] is None
        assert body["next_id"] is None

    def test_cursor_requires_auth(self, client) -> None:  # type: ignore[no-untyped-def]
        """Sin token no se puede consultar el cursor."""
        res = client.get(f"/v1/admin/save/canonical-products/{self.CANONICAL_A}/cursor")
        assert res.status_code in (401, 403)


class TestBulkResolveCanonicalBrands:
    """`POST /canonical-products/bulk-resolve-brands` — "Clasificar marcas" del menú Acciones.

    Precedencia PROVEEDOR → NOMBRE: la marca que ya reporta una tienda enlazada es un dato
    OBSERVADO en la fuente; reconocerla dentro del nombre es una deducción. Preferir la deducción
    sobre la observación sería degradar el mejor dato que tenemos.
    """

    def _create(self, db_session, user_id, name: str, brand: str = "") -> str:  # type: ignore[no-untyped-def]
        res = _call(db_session, user_id, "post", "/canonical-products", json={
            "name": name, "brand": brand, "size_amount": 1.0, "size_measure": "mass",
        })
        assert res.status_code == 201, res.text
        return res.json()["canonical_product_id"]

    def _brand_of(self, db_session, canonical_id: str) -> str | None:  # type: ignore[no-untyped-def]
        import uuid as _uuid

        from src.contexts.save.infrastructure.models import BrandModel, CanonicalProductModel

        row = db_session.get(CanonicalProductModel, _uuid.UUID(canonical_id))
        if row is None or row.brand_id is None:
            return None
        return db_session.get(BrandModel, row.brand_id).name

    def _brand_count(self, db_session) -> int:  # type: ignore[no-untyped-def]
        from sqlalchemy import func, select

        from src.contexts.save.infrastructure.models import BrandModel

        return db_session.execute(select(func.count()).select_from(BrandModel)).scalar_one()

    def test_recognises_a_known_brand_in_the_name_without_creating_new_brands(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "super_admin")
        # este canónico SIEMBRA la marca en el catálogo…
        self._create(db_session, user_id, "Arroz Cualquiera", brand="MARCAFARO")
        # …y este otro, sin marca, la lleva dentro del nombre
        target = self._create(db_session, user_id, "Arroz Marcafaro Premium 5 Lb")
        before = self._brand_count(db_session)

        res = _call(db_session, user_id, "post", "/canonical-products/bulk-resolve-brands",
                    json={"canonical_product_ids": [target]})

        assert res.status_code == 200, res.text
        body = res.json()
        assert body["resolved"] == 1 and body["skipped"] == 0
        assert body["rows"][0]["source"] == "name"
        assert self._brand_of(db_session, target) == "MARCAFARO"
        # RECONOCE, no inventa: no puede haber aparecido ninguna marca nueva
        assert self._brand_count(db_session) == before

    def test_a_canonical_that_already_has_a_brand_is_skipped_not_overwritten(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "super_admin")
        self._create(db_session, user_id, "Arroz Cualquiera", brand="MARCAFARO")
        target = self._create(db_session, user_id, "Arroz Marcafaro Premium", brand="YAPUESTA")

        res = _call(db_session, user_id, "post", "/canonical-products/bulk-resolve-brands",
                    json={"canonical_product_ids": [target]})

        assert res.json()["skipped"] == 1
        assert self._brand_of(db_session, target) == "YAPUESTA"

    def test_a_name_without_any_known_brand_is_left_alone(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "super_admin")
        target = self._create(db_session, user_id, "Zzqqxx Producto Sin Marca Conocida")

        res = _call(db_session, user_id, "post", "/canonical-products/bulk-resolve-brands",
                    json={"canonical_product_ids": [target]})

        assert res.json()["unresolved"] == 1
        assert self._brand_of(db_session, target) is None

    def test_requires_the_catalog_capability(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "normal_user")

        res = _call(db_session, user_id, "post", "/canonical-products/bulk-resolve-brands",
                    json={"canonical_product_ids": []})

        assert res.status_code == 403


class TestFilterByMissingBrand:
    """`?has_brand=false` — el conjunto sobre el que se corre "Clasificar marcas"."""

    def test_lists_only_the_ones_without_brand(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "super_admin")
        with_brand = _call(db_session, user_id, "post", "/canonical-products", json={
            "name": "Producto Con Marca Zzq", "brand": "TIENEMARCA",
            "size_amount": 1.0, "size_measure": "mass",
        }).json()["canonical_product_id"]
        without = _call(db_session, user_id, "post", "/canonical-products", json={
            "name": "Producto Sin Marca Zzq", "brand": "",
            "size_amount": 1.0, "size_measure": "mass",
        }).json()["canonical_product_id"]

        res = _call(db_session, user_id, "get",
                    "/canonical-products?has_brand=false&search=Zzq&limit=200")

        assert res.status_code == 200, res.text
        ids = [r["canonical_product_id"] for r in res.json()["rows"]]
        assert without in ids
        assert with_brand not in ids
