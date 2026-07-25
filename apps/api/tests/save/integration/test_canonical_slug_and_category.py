"""Integration — regeneración de slug (US-CP-D2b) y categoría con sugerencias (US-CP-D2c).

El slug es la llave PÚBLICA del producto. Todo lo de acá gira alrededor de una idea: cambiarlo
rompe enlaces compartidos y el canonical SEO, así que sólo puede pasar cuando alguien lo pide
explícitamente, sabiendo qué va a pasar, y quedando registrado.
"""
from __future__ import annotations

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from seeds.identity_seed import seed_identity
from src.api.composition_root import get_session
from src.api.extensions.security import get_current_user_id
from src.contexts.identity.infrastructure.models import UserModel, UserRoleModel
from src.contexts.save.infrastructure.models import (
    AdminAuditLogModel,
    CanonicalProductModel,
    CategoryClassificationModel,
    TaxonomyNodeModel,
)
from src.main import app

MARKET = "DO"


def _admin(db_session) -> str:  # type: ignore[no-untyped-def]
    seed_identity(db_session)
    user = UserModel(
        email="slug@cuadra.do", name="slug", home_market_id=MARKET, current_market_id=MARKET
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(UserRoleModel(user_id=user.id, role_key="super_admin"))
    db_session.flush()
    return str(user.id)


def _call(db_session, user_id, method, path, json=None):  # type: ignore[no-untyped-def]
    app.dependency_overrides[get_session] = lambda: db_session
    app.dependency_overrides[get_current_user_id] = lambda: user_id
    try:
        with TestClient(app) as c:
            kwargs = {"json": json} if json is not None else {}
            return getattr(c, method)(f"/v1/admin/save{path}", **kwargs)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def canonical(db_session):  # type: ignore[no-untyped-def]
    cp = CanonicalProductModel(
        slug="arroz-slug-test-10-lb",
        name="Arroz Slug Test",
        display_size="10 Lb",
        size_amount=Decimal("10"),
        size_measure="mass",
        market_id=MARKET,
    )
    db_session.add(cp)
    db_session.flush()
    return cp


class TestSlugPreview:
    def test_it_shows_the_current_and_the_candidate(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        res = _call(db_session, user_id, "get", f"/canonical-products/{canonical.id}/slug-preview")

        assert res.status_code == 200, res.text
        assert res.json()["current_slug"] == "arroz-slug-test-10-lb"
        assert res.json()["new_slug"]

    def test_with_no_changes_the_candidate_is_the_SAME_slug(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        """Trampa: `_unique_slug` sufija `-2` cuando el candidato ya existe… y el que existe es
        ESTE producto. Sin excluirse a sí mismo, previsualizar sin haber cambiado nada propondría
        renombrar de `arroz-slug-test-10-lb` a `arroz-slug-test-10-lb-2` — un cambio de URL
        pública a cambio de nada."""
        user_id = _admin(db_session)
        body = _call(
            db_session, user_id, "get", f"/canonical-products/{canonical.id}/slug-preview"
        ).json()

        assert body["new_slug"] == body["current_slug"]
        assert body["would_change"] is False

    def test_after_renaming_the_candidate_reflects_the_new_name(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        _call(
            db_session, user_id, "patch", f"/canonical-products/{canonical.id}",
            {"name": "Habichuela Renombrada"},
        )
        body = _call(
            db_session, user_id, "get", f"/canonical-products/{canonical.id}/slug-preview"
        ).json()

        assert body["would_change"] is True
        assert body["new_slug"].startswith("habichuela-renombrada")

    def test_previewing_persists_nothing(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        _call(db_session, user_id, "patch", f"/canonical-products/{canonical.id}",
              {"name": "Otro Nombre Distinto"})
        _call(db_session, user_id, "get", f"/canonical-products/{canonical.id}/slug-preview")

        db_session.refresh(canonical)
        assert canonical.slug == "arroz-slug-test-10-lb", "el preview NO puede tocar el slug"


class TestRegenerateSlug:
    def test_editing_the_name_does_NOT_change_the_slug_by_itself(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        """US-CP-D2b, la regla central: el slug es estable por defecto."""
        user_id = _admin(db_session)
        _call(db_session, user_id, "patch", f"/canonical-products/{canonical.id}",
              {"name": "Nombre Completamente Nuevo"})

        db_session.refresh(canonical)
        assert canonical.slug == "arroz-slug-test-10-lb"

    def test_the_explicit_action_does_change_it(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        _call(db_session, user_id, "patch", f"/canonical-products/{canonical.id}",
              {"name": "Nombre Completamente Nuevo"})
        res = _call(
            db_session, user_id, "post", f"/canonical-products/{canonical.id}/regenerate-slug"
        )

        assert res.status_code == 200, res.text
        assert res.json()["slug"].startswith("nombre-completamente-nuevo")

    def test_it_records_old_and_new_slug_in_the_audit(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        """US-CP-D2b lo pide literal: si se regenera, queda auditado `old_slug` y `new_slug`.
        Sin eso no hay forma de reconstruir a qué URL redirigir cuando alguien reporte un 404."""
        user_id = _admin(db_session)
        _call(db_session, user_id, "patch", f"/canonical-products/{canonical.id}",
              {"name": "Nombre Para Auditar"})
        _call(db_session, user_id, "post", f"/canonical-products/{canonical.id}/regenerate-slug")

        row = db_session.scalars(
            select(AdminAuditLogModel).where(
                AdminAuditLogModel.target_id == str(canonical.id),
                AdminAuditLogModel.action == "canonical_product.regenerate_slug",
            )
        ).first()
        assert row is not None
        assert row.payload_summary["old_slug"] == "arroz-slug-test-10-lb"
        assert row.payload_summary["new_slug"].startswith("nombre-para-auditar")

    def test_regenerating_with_no_changes_leaves_the_slug_untouched(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        res = _call(
            db_session, user_id, "post", f"/canonical-products/{canonical.id}/regenerate-slug"
        )

        assert res.status_code == 200
        assert res.json()["slug"] == "arroz-slug-test-10-lb"

    def test_an_unknown_id_is_404(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        res = _call(
            db_session, user_id, "post",
            "/canonical-products/99999999-9999-4999-8999-999999999999/regenerate-slug",
        )
        assert res.status_code == 404


class TestCategorySuggestions:
    """El índice léxico se arma sobre la taxonomía REAL del mercado. Los fixtures usan un token
    inventado (`zarzaparrilla`) a propósito: reusar uno del catálogo real (`arroz`) lo volvería
    AMBIGUO contra las hojas ya sembradas y el índice lo descartaría — que es el comportamiento
    correcto del léxico, pero convertiría al test en una trampa."""

    @pytest.fixture
    def taxonomy(self, db_session):  # type: ignore[no-untyped-def]
        parent = TaxonomyNodeModel(name="Despensa Sug", level=0, market_id=MARKET, parent_id=None)
        db_session.add(parent)
        db_session.flush()
        leaf = TaxonomyNodeModel(
            name="Zarzaparrilla", level=1, market_id=MARKET, parent_id=parent.id
        )
        db_session.add(leaf)
        db_session.flush()
        return leaf

    @pytest.fixture
    def product(self, db_session):  # type: ignore[no-untyped-def]
        cp = CanonicalProductModel(
            slug="zarzaparrilla-sug-test", name="Zarzaparrilla Sug Test",
            size_amount=Decimal("1"), size_measure="count", market_id=MARKET,
        )
        db_session.add(cp)
        db_session.flush()
        return cp

    def test_it_suggests_the_leaf_that_the_name_hits(self, db_session, product, taxonomy) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        res = _call(
            db_session, user_id, "get",
            f"/canonical-products/{product.id}/category-suggestions",
        )

        assert res.status_code == 200, res.text
        ids = [s["taxonomy_node_id"] for s in res.json()]
        assert str(taxonomy.id) in ids

    def test_each_suggestion_explains_why(self, db_session, product, taxonomy) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        body = _call(
            db_session, user_id, "get",
            f"/canonical-products/{product.id}/category-suggestions",
        ).json()

        suggestion = next(s for s in body if s["taxonomy_node_id"] == str(taxonomy.id))
        assert suggestion["signal"] == "lexicon"
        assert "zarzaparrilla" in suggestion["matched_tokens"]
        assert suggestion["name"] == "Zarzaparrilla"

    def test_a_name_with_no_signal_suggests_nothing(self, db_session, taxonomy) -> None:  # type: ignore[no-untyped-def]
        """No inventar es la regla: el árbol completo queda como fallback."""
        cp = CanonicalProductModel(
            slug="zzz-sin-senal", name="Zzz Sin Senal Alguna",
            size_amount=Decimal("1"), size_measure="count", market_id=MARKET,
        )
        db_session.add(cp)
        db_session.flush()
        user_id = _admin(db_session)

        res = _call(
            db_session, user_id, "get", f"/canonical-products/{cp.id}/category-suggestions"
        )
        assert res.status_code == 200
        assert res.json() == []


class TestSetCategoryRecordsTheHuman:
    @pytest.fixture
    def leaf(self, db_session):  # type: ignore[no-untyped-def]
        parent = TaxonomyNodeModel(name="Despensa Hum", level=0, market_id=MARKET, parent_id=None)
        db_session.add(parent)
        db_session.flush()
        node = TaxonomyNodeModel(name="Granos Hum", level=1, market_id=MARKET, parent_id=parent.id)
        db_session.add(node)
        db_session.flush()
        return node

    def test_assigning_a_category_writes_a_human_classification(self, db_session, canonical, leaf) -> None:  # type: ignore[no-untyped-def]
        """US-CP-D2c: lo que decide una persona NUNCA se registra como decidido por el sistema —
        si no, la tasa de auto-clasificación mediría nuestro trabajo manual como éxito del pipeline."""
        user_id = _admin(db_session)
        res = _call(
            db_session, user_id, "patch", f"/canonical-products/{canonical.id}/category",
            {"taxonomy_node_id": str(leaf.id)},
        )

        assert res.status_code == 200, res.text
        assert res.json()["category"] == "Granos Hum"

        row = db_session.scalars(
            select(CategoryClassificationModel).where(
                CategoryClassificationModel.canonical_product_id == canonical.id,
                CategoryClassificationModel.status == "active",
            )
        ).first()
        assert row is not None
        assert row.method == "human"

    def test_it_also_sets_the_column_the_listing_reads(self, db_session, canonical, leaf) -> None:  # type: ignore[no-untyped-def]
        """El badge `Sin categoría` del listado sale de `canonical_product.taxonomy_node_id`:
        escribir sólo la clasificación dejaría la lista mintiendo."""
        user_id = _admin(db_session)
        _call(
            db_session, user_id, "patch", f"/canonical-products/{canonical.id}/category",
            {"taxonomy_node_id": str(leaf.id)},
        )

        db_session.refresh(canonical)
        assert str(canonical.taxonomy_node_id) == str(leaf.id)

    def test_the_change_is_audited_with_old_and_new(self, db_session, canonical, leaf) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        _call(
            db_session, user_id, "patch", f"/canonical-products/{canonical.id}/category",
            {"taxonomy_node_id": str(leaf.id)},
        )

        row = db_session.scalars(
            select(AdminAuditLogModel).where(
                AdminAuditLogModel.action == "canonical_product.set_category",
                AdminAuditLogModel.target_id == str(canonical.id),
            )
        ).first()
        assert row is not None
        assert row.payload_summary["new_category"] == "Granos Hum"

    def test_an_empty_category_is_rejected_not_silently_stored(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        res = _call(
            db_session, user_id, "patch", f"/canonical-products/{canonical.id}/category",
            {"taxonomy_node_id": ""},
        )
        assert res.status_code == 422
