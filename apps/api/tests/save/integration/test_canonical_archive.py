"""Integration — archivado (soft-delete) del canónico (F5, US-CP-L6/D12).

Lo que se prueba acá es la ÚNICA razón por la que la acción existe: que archivar SAQUE el producto
de las superficies públicas sin destruir nada. Un archivado que no oculta es peor que no tener la
acción — el operador cree que resolvió un problema del catálogo y sigue publicado.
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
    CanonicalProductModel,
    ProviderModel,
    StoreProductModel,
)
from src.contexts.save.infrastructure.repositories import (
    SqlCanonicalProductRepository,
    SqlStoreProductRepository,
)
from src.main import app

MARKET = "DO"


def _seed_admin(db_session) -> str:  # type: ignore[no-untyped-def]
    seed_identity(db_session)
    user = UserModel(
        email="archiver@cuadra.do", name="archiver",
        home_market_id=MARKET, current_market_id=MARKET,
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
    """Un canónico con una tienda enlazada — para poder comprobar que el histórico sobrevive."""
    provider = ProviderModel(
        name="Tienda Archivo Test", type="supermarket", platform="vtex", market_id=MARKET
    )
    db_session.add(provider)
    db_session.flush()

    cp = CanonicalProductModel(
        slug="producto-archivable-test",
        name="Producto Archivable Test",
        size_amount=Decimal("1"),
        size_measure="count",
        market_id=MARKET,
    )
    db_session.add(cp)
    db_session.flush()

    sp = StoreProductModel(
        provider_id=provider.id,
        canonical_product_id=cp.id,
        external_id="ext-archivo-test",
        current_price_minor=9900,
        currency="DOP",
        last_seen_at=datetime.now(UTC),
        is_available=True,
        name="Producto Archivable Test",
    )
    db_session.add(sp)
    db_session.flush()
    return cp


class TestArchiveEndpoint:
    def test_archiving_stamps_archived_at(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_admin(db_session)
        res = _call(db_session, user_id, "post", f"/canonical-products/{canonical.id}/archive")

        assert res.status_code == 200, res.text
        assert res.json()["archived_at"] is not None

    def test_archiving_is_audited(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        from sqlalchemy import select as sa_select

        from src.contexts.save.infrastructure.models import AdminAuditLogModel

        user_id = _seed_admin(db_session)
        _call(db_session, user_id, "post", f"/canonical-products/{canonical.id}/archive")

        rows = db_session.scalars(
            sa_select(AdminAuditLogModel).where(
                AdminAuditLogModel.target_id == str(canonical.id),
                AdminAuditLogModel.action == "canonical_product.archive",
            )
        ).all()
        assert len(rows) == 1

    def test_archiving_does_not_delete_the_row_nor_its_links(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        """Soft-delete: borrar la fila dejaría `store_product.canonical_product_id` colgando y
        rompería comparaciones ya publicadas."""
        user_id = _seed_admin(db_session)
        _call(db_session, user_id, "post", f"/canonical-products/{canonical.id}/archive")

        still_there = db_session.get(CanonicalProductModel, canonical.id)
        assert still_there is not None
        links = SqlStoreProductRepository(db_session).list_by_canonical(str(canonical.id))
        assert len(links) == 1, "archivar NO puede desenlazar las tiendas"

    def test_unarchiving_restores_it(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_admin(db_session)
        _call(db_session, user_id, "post", f"/canonical-products/{canonical.id}/archive")
        res = _call(db_session, user_id, "post", f"/canonical-products/{canonical.id}/unarchive")

        assert res.status_code == 200, res.text
        assert res.json()["archived_at"] is None

    def test_archiving_an_unknown_id_is_404(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_admin(db_session)
        res = _call(
            db_session, user_id, "post",
            "/canonical-products/99999999-9999-4999-8999-999999999999/archive",
        )
        assert res.status_code == 404


class TestArchivedIsHiddenFromThePublicSite:
    """La razón de ser de la acción. Si algo de esto falla, archivar es una mentira en verde."""

    def test_it_disappears_from_get_by_slug(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        repo = SqlCanonicalProductRepository(db_session)
        assert repo.get_by_slug(canonical.slug, MARKET) is not None

        user_id = _seed_admin(db_session)
        _call(db_session, user_id, "post", f"/canonical-products/{canonical.id}/archive")

        assert repo.get_by_slug(canonical.slug, MARKET) is None

    def test_it_disappears_from_search(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        repo = SqlCanonicalProductRepository(db_session)
        user_id = _seed_admin(db_session)
        _call(db_session, user_id, "post", f"/canonical-products/{canonical.id}/archive")

        names = [p.name for p in repo.search("Producto Archivable Test", MARKET)]
        assert "Producto Archivable Test" not in names

    def test_it_disappears_from_the_public_offerings(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        """`_offerings` alimenta los rails y las páginas de categoría/tienda del sitio público."""
        store_repo = SqlStoreProductRepository(db_session)
        before = [o.product_id for o in store_repo.list_market_offerings(MARKET)]
        assert str(canonical.id) in before

        user_id = _seed_admin(db_session)
        _call(db_session, user_id, "post", f"/canonical-products/{canonical.id}/archive")

        after = [o.product_id for o in store_repo.list_market_offerings(MARKET)]
        assert str(canonical.id) not in after

    def test_unarchiving_brings_it_back(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        repo = SqlCanonicalProductRepository(db_session)
        user_id = _seed_admin(db_session)
        _call(db_session, user_id, "post", f"/canonical-products/{canonical.id}/archive")
        _call(db_session, user_id, "post", f"/canonical-products/{canonical.id}/unarchive")

        assert repo.get_by_slug(canonical.slug, MARKET) is not None


class TestArchivedInTheAdminList:
    def test_archived_products_are_hidden_by_default(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_admin(db_session)
        _call(db_session, user_id, "post", f"/canonical-products/{canonical.id}/archive")

        res = _call(
            db_session, user_id, "get",
            "/canonical-products?search=Producto Archivable Test",
        )
        assert res.status_code == 200
        assert res.json()["total"] == 0

    def test_they_can_be_listed_on_purpose_to_restore_them(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        """Si el admin no pudiera verlos, archivar sería irreversible en la práctica."""
        user_id = _seed_admin(db_session)
        _call(db_session, user_id, "post", f"/canonical-products/{canonical.id}/archive")

        res = _call(
            db_session, user_id, "get",
            "/canonical-products?search=Producto Archivable Test&include_archived=true",
        )
        assert res.status_code == 200
        assert res.json()["total"] == 1
        assert res.json()["rows"][0]["archived_at"] is not None


class TestInternalNote:
    def test_a_note_can_be_saved_and_read_back(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_admin(db_session)
        res = _call(
            db_session, user_id, "patch",
            f"/canonical-products/{canonical.id}/internal-note",
            {"internal_note": "Revisar el tamaño con Sirena."},
        )
        assert res.status_code == 200, res.text
        assert res.json()["internal_note"] == "Revisar el tamaño con Sirena."

    def test_the_note_never_leaks_into_the_public_dto(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        """US-CP-D10: la nota es de coordinación interna. Que se filtre al sitio público sería
        publicar comentarios del equipo sobre un producto."""
        user_id = _seed_admin(db_session)
        _call(
            db_session, user_id, "patch",
            f"/canonical-products/{canonical.id}/internal-note",
            {"internal_note": "NO PUBLICAR: proveedor en disputa"},
        )

        entity = SqlCanonicalProductRepository(db_session).get_by_slug(canonical.slug, MARKET)
        assert entity is not None
        assert "internal_note" not in {f for f in getattr(entity, "__slots__", ())}
        assert "disputa" not in str(entity)

    def test_the_note_change_is_audited(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        from sqlalchemy import select as sa_select

        from src.contexts.save.infrastructure.models import AdminAuditLogModel

        user_id = _seed_admin(db_session)
        _call(
            db_session, user_id, "patch",
            f"/canonical-products/{canonical.id}/internal-note",
            {"internal_note": "auditame"},
        )
        rows = db_session.scalars(
            sa_select(AdminAuditLogModel).where(
                AdminAuditLogModel.target_id == str(canonical.id),
                AdminAuditLogModel.action == "canonical_product.internal_note",
            )
        ).all()
        assert len(rows) == 1

    def test_the_note_content_is_NOT_copied_into_the_audit_payload(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        """El log de auditoría se lee en otra pantalla y se exporta: copiar el texto de la nota
        ahí duplicaría contenido interno en un sitio con otro control de acceso."""
        from sqlalchemy import select as sa_select

        from src.contexts.save.infrastructure.models import AdminAuditLogModel

        user_id = _seed_admin(db_session)
        _call(
            db_session, user_id, "patch",
            f"/canonical-products/{canonical.id}/internal-note",
            {"internal_note": "secreto-que-no-debe-viajar"},
        )
        row = db_session.scalars(
            sa_select(AdminAuditLogModel).where(
                AdminAuditLogModel.action == "canonical_product.internal_note"
            )
        ).first()
        assert "secreto-que-no-debe-viajar" not in str(row.payload_summary)
