"""Integration — galería ordenada de imágenes del canónico (F5).

Todo gira alrededor de UNA invariante: `canonical_product.image_url` es el espejo de la posición
1. El sitio público (og:image, canonical, tarjetas, rails) lee esa columna; si la galería y el
espejo se desincronizan, el admin muestra una imagen y el público otra — y nadie se entera hasta
que un usuario lo reporta.

La segunda trampa es la constraint `UNIQUE(canonical_product_id, position)`: reordenar actualizando
posición por posición choca a mitad de camino.
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
    CanonicalProductImageModel,
    CanonicalProductModel,
    ProviderModel,
    StoreProductModel,
)
from src.main import app

MARKET = "DO"


def _admin(db_session) -> str:  # type: ignore[no-untyped-def]
    seed_identity(db_session)
    user = UserModel(
        email="gallery@cuadra.do", name="g", home_market_id=MARKET, current_market_id=MARKET
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
        slug="galeria-test", name="Producto Galeria Test",
        size_amount=Decimal("1"), size_measure="count", market_id=MARKET,
    )
    db_session.add(cp)
    db_session.flush()
    return cp


@pytest.fixture
def store_product(db_session, canonical):  # type: ignore[no-untyped-def]
    provider = ProviderModel(
        name="Tienda Galeria", type="supermarket", platform="vtex", market_id=MARKET
    )
    db_session.add(provider)
    db_session.flush()
    sp = StoreProductModel(
        provider_id=provider.id, canonical_product_id=canonical.id, external_id="gal-1",
        current_price_minor=1000, currency="DOP", is_available=True,
        image_url="https://cdn/tienda-1.jpg",
    )
    db_session.add(sp)
    db_session.flush()
    return sp


def _positions(db_session, canonical_id):  # type: ignore[no-untyped-def]
    return [
        (r.position, r.url)
        for r in db_session.scalars(
            select(CanonicalProductImageModel)
            .where(CanonicalProductImageModel.canonical_product_id == canonical_id)
            .order_by(CanonicalProductImageModel.position)
        )
    ]


class TestAddImage:
    def test_the_first_image_lands_in_position_one(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        res = _call(
            db_session, user_id, "post", f"/canonical-products/{canonical.id}/images",
            {"url": "https://cdn/a.jpg"},
        )

        assert res.status_code == 201, res.text
        assert _positions(db_session, canonical.id) == [(1, "https://cdn/a.jpg")]

    def test_the_next_ones_are_appended_in_order(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        for url in ("https://cdn/a.jpg", "https://cdn/b.jpg", "https://cdn/c.jpg"):
            _call(
                db_session, user_id, "post", f"/canonical-products/{canonical.id}/images",
                {"url": url},
            )

        assert [p for p, _ in _positions(db_session, canonical.id)] == [1, 2, 3]

    def test_position_one_MIRRORS_into_image_url(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        """La invariante. El sitio público lee `image_url`; si no se espeja, el admin muestra una
        imagen y el público otra."""
        user_id = _admin(db_session)
        _call(
            db_session, user_id, "post", f"/canonical-products/{canonical.id}/images",
            {"url": "https://cdn/principal.jpg"},
        )

        db_session.refresh(canonical)
        assert canonical.image_url == "https://cdn/principal.jpg"

    def test_a_second_image_does_NOT_change_the_public_one(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        _call(db_session, user_id, "post", f"/canonical-products/{canonical.id}/images",
              {"url": "https://cdn/principal.jpg"})
        _call(db_session, user_id, "post", f"/canonical-products/{canonical.id}/images",
              {"url": "https://cdn/secundaria.jpg"})

        db_session.refresh(canonical)
        assert canonical.image_url == "https://cdn/principal.jpg"

    def test_it_remembers_which_store_it_came_from(self, db_session, canonical, store_product) -> None:  # type: ignore[no-untyped-def]
        """Sin el origen no se puede decir "la 2da la tomamos de Sirena" ni volver a ella."""
        user_id = _admin(db_session)
        res = _call(
            db_session, user_id, "post", f"/canonical-products/{canonical.id}/images",
            {"url": "https://cdn/tienda-1.jpg", "source_store_product_id": str(store_product.id)},
        )

        assert res.status_code == 201
        # Acotado al canónico del test: la tabla ya trae filas del backfill de la migración.
        row = db_session.scalars(
            select(CanonicalProductImageModel).where(
                CanonicalProductImageModel.canonical_product_id == canonical.id
            )
        ).first()
        assert str(row.source_store_product_id) == str(store_product.id)

    def test_the_same_url_twice_is_rejected(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        """Dos posiciones con la misma foto no es una galería, es un error de dedo."""
        user_id = _admin(db_session)
        _call(db_session, user_id, "post", f"/canonical-products/{canonical.id}/images",
              {"url": "https://cdn/a.jpg"})
        res = _call(db_session, user_id, "post", f"/canonical-products/{canonical.id}/images",
                    {"url": "https://cdn/a.jpg"})

        assert res.status_code == 409


class TestReorder:
    @pytest.fixture
    def three(self, db_session, canonical):  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        ids = []
        for url in ("https://cdn/a.jpg", "https://cdn/b.jpg", "https://cdn/c.jpg"):
            res = _call(
                db_session, user_id, "post", f"/canonical-products/{canonical.id}/images",
                {"url": url},
            )
            ids.append(res.json()["id"])
        return user_id, ids

    def test_reordering_sets_the_new_positions(self, db_session, canonical, three) -> None:  # type: ignore[no-untyped-def]
        """Trampa: `UNIQUE(canonical, position)` hace chocar cualquier reordenamiento que
        actualice posición por posición — a mitad de camino dos filas comparten número."""
        user_id, ids = three
        res = _call(
            db_session, user_id, "patch", f"/canonical-products/{canonical.id}/images/order",
            {"image_ids": [ids[2], ids[0], ids[1]]},
        )

        assert res.status_code == 200, res.text
        assert _positions(db_session, canonical.id) == [
            (1, "https://cdn/c.jpg"),
            (2, "https://cdn/a.jpg"),
            (3, "https://cdn/b.jpg"),
        ]

    def test_reordering_UPDATES_the_public_image(self, db_session, canonical, three) -> None:  # type: ignore[no-untyped-def]
        user_id, ids = three
        _call(
            db_session, user_id, "patch", f"/canonical-products/{canonical.id}/images/order",
            {"image_ids": [ids[2], ids[0], ids[1]]},
        )

        db_session.refresh(canonical)
        assert canonical.image_url == "https://cdn/c.jpg"

    def test_an_incomplete_order_is_rejected(self, db_session, canonical, three) -> None:  # type: ignore[no-untyped-def]
        """Mandar 2 de 3 dejaría una imagen sin posición: se rechaza en vez de adivinar dónde va."""
        user_id, ids = three
        res = _call(
            db_session, user_id, "patch", f"/canonical-products/{canonical.id}/images/order",
            {"image_ids": [ids[0], ids[1]]},
        )
        assert res.status_code == 422


class TestRemove:
    @pytest.fixture
    def three(self, db_session, canonical):  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        ids = []
        for url in ("https://cdn/a.jpg", "https://cdn/b.jpg", "https://cdn/c.jpg"):
            res = _call(
                db_session, user_id, "post", f"/canonical-products/{canonical.id}/images",
                {"url": url},
            )
            ids.append(res.json()["id"])
        return user_id, ids

    def test_removing_compacts_the_remaining_positions(self, db_session, canonical, three) -> None:  # type: ignore[no-untyped-def]
        """Sin compactar quedaría un hueco (1, 3) y la "2da imagen" dejaría de existir aunque
        haya dos fotos."""
        user_id, ids = three
        res = _call(
            db_session, user_id, "delete", f"/canonical-products/{canonical.id}/images/{ids[1]}"
        )

        assert res.status_code == 200, res.text
        assert _positions(db_session, canonical.id) == [
            (1, "https://cdn/a.jpg"),
            (2, "https://cdn/c.jpg"),
        ]

    def test_removing_the_first_promotes_the_next_one_publicly(self, db_session, canonical, three) -> None:  # type: ignore[no-untyped-def]
        user_id, ids = three
        _call(db_session, user_id, "delete", f"/canonical-products/{canonical.id}/images/{ids[0]}")

        db_session.refresh(canonical)
        assert canonical.image_url == "https://cdn/b.jpg"

    def test_removing_the_last_one_leaves_the_product_with_NO_public_image(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        """Vaciar la galería tiene que vaciar el espejo: dejar `image_url` apuntando a una foto
        que ya no está en la galería es exactamente la desincronización que hay que evitar."""
        user_id = _admin(db_session)
        res = _call(
            db_session, user_id, "post", f"/canonical-products/{canonical.id}/images",
            {"url": "https://cdn/unica.jpg"},
        )
        _call(
            db_session, user_id, "delete",
            f"/canonical-products/{canonical.id}/images/{res.json()['id']}",
        )

        db_session.refresh(canonical)
        assert canonical.image_url is None


class TestListing:
    def test_the_detail_returns_the_gallery_in_order(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        for url in ("https://cdn/a.jpg", "https://cdn/b.jpg"):
            _call(db_session, user_id, "post", f"/canonical-products/{canonical.id}/images",
                  {"url": url})

        res = _call(db_session, user_id, "get", f"/canonical-products/{canonical.id}/images")

        assert res.status_code == 200, res.text
        assert [i["position"] for i in res.json()] == [1, 2]
        assert [i["url"] for i in res.json()] == ["https://cdn/a.jpg", "https://cdn/b.jpg"]

    def test_a_product_with_no_images_returns_an_empty_gallery(self, db_session, canonical) -> None:  # type: ignore[no-untyped-def]
        user_id = _admin(db_session)
        res = _call(db_session, user_id, "get", f"/canonical-products/{canonical.id}/images")

        assert res.status_code == 200
        assert res.json() == []
