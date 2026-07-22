"""Integration — API admin de Productos Canónicos (F5).

Lo que se prueba acá y no en unit: que el GATE esté puesto (una ruta sin gatear es un agujero, no
un bug de lógica) y que los datos derivados (matched_provider_count, completeness_score) se
calculen correctamente desde la DB real.
"""
from __future__ import annotations

from datetime import UTC, datetime
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
                TaxonomyNodeModel(
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
                TaxonomyNodeModel(
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
            "name": "Producto Duplicado",
            "brand": "MARCA",
            "size_amount": 1.0,
            "size_measure": "count",
        }
        res1 = self._post(db_session, user_id, body1)
        assert res1.status_code == 201
        slug1 = res1.json()["slug"]

        # Crear segundo canónico con mismo nombre/marca/tamaño
        body2 = {
            "name": "Producto Duplicado",
            "brand": "MARCA",
            "size_amount": 1.0,
            "size_measure": "count",
        }
        res2 = self._post(db_session, user_id, body2)
        assert res2.status_code == 201
        slug2 = res2.json()["slug"]

        # Los slugs deben ser diferentes
        assert slug1 != slug2
        assert slug2.endswith("-2")
