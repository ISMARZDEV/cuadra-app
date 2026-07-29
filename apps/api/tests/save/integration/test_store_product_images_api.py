"""Integration — galería de un `store_product` para el lightbox de la Cola de revisión.

La tabla `store_product_image` existía y la ingesta la llena, pero NINGÚN endpoint la exponía: el
admin sólo veía `store_product.image_url` (la primera, denormalizada). Sin esto el modal de la cola
mostraría siempre una sola imagen aunque la tienda publique cinco.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from seeds.identity_seed import seed_identity
from src.api.composition_root import get_session
from src.api.extensions.security import get_current_user_id
from src.contexts.identity.infrastructure.models import UserModel, UserRoleModel
from src.contexts.save.infrastructure.models import (
    ProviderModel,
    StoreProductImageModel,
    StoreProductModel,
)
from src.main import app


def _seed_admin(db_session) -> str:  # type: ignore[no-untyped-def]
    seed_identity(db_session)
    user = UserModel(
        email=f"imgs-{uuid.uuid4().hex[:6]}@cuadra.do", name="imgs",
        home_market_id="DO", current_market_id="DO",
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(UserRoleModel(user_id=user.id, role_key="super_admin"))
    db_session.flush()
    return str(user.id)


def _seed_store_product(db_session, urls: list[str]) -> str:  # type: ignore[no-untyped-def]
    pid = uuid.uuid4()
    db_session.add(
        ProviderModel(id=pid, name=f"Tienda {pid.hex[:5]}", type="supermarket",
                      platform="vtex", market_id="DO")
    )
    db_session.flush()
    sp_id = uuid.uuid4()
    db_session.add(
        StoreProductModel(
            id=sp_id, provider_id=pid, external_id=f"ext-{sp_id.hex[:8]}",
            current_price_minor=10000, currency="DOP", name="Producto con galería",
            image_url=urls[0] if urls else None,
        )
    )
    db_session.flush()
    # A PROPÓSITO desordenadas: el endpoint tiene que devolverlas por `position`, no por inserción.
    for pos, url in reversed(list(enumerate(urls))):
        db_session.add(
            StoreProductImageModel(store_product_id=sp_id, url=url, position=pos)
        )
    db_session.flush()
    return str(sp_id)


def _get(db_session, user_id, sp_id):  # type: ignore[no-untyped-def]
    app.dependency_overrides[get_session] = lambda: db_session
    app.dependency_overrides[get_current_user_id] = lambda: user_id
    try:
        with TestClient(app) as c:
            return c.get(f"/v1/admin/save/store-products/{sp_id}/images")
    finally:
        app.dependency_overrides.clear()


class TestStoreProductImages:
    def test_returns_the_gallery_in_position_order(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_admin(db_session)
        sp_id = _seed_store_product(db_session, ["https://cdn/a.jpg", "https://cdn/b.jpg", "https://cdn/c.jpg"])

        res = _get(db_session, user_id, sp_id)

        assert res.status_code == 200, res.text
        assert res.json() == ["https://cdn/a.jpg", "https://cdn/b.jpg", "https://cdn/c.jpg"]

    def test_a_store_product_without_gallery_returns_empty(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Lista vacía y NO 404: el producto existe, sólo que la tienda no publicó fotos."""
        user_id = _seed_admin(db_session)
        sp_id = _seed_store_product(db_session, [])

        res = _get(db_session, user_id, sp_id)

        assert res.status_code == 200, res.text
        assert res.json() == []

    def test_an_unparseable_id_returns_empty_not_a_500(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_admin(db_session)

        res = _get(db_session, user_id, "no-es-un-uuid")

        assert res.status_code == 200, res.text
        assert res.json() == []

    @pytest.mark.parametrize("path", ["/v1/admin/save/store-products/x/images"])
    def test_the_route_is_gated(self, path) -> None:  # type: ignore[no-untyped-def]
        """Sin capability no se ven imágenes de la ingesta."""
        with TestClient(app) as c:
            assert c.get(path).status_code in (401, 403)
