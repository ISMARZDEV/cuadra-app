"""Integration — POST /v1/identity/dev-login (solo en dev): emite un JWT usable.

Desbloquea el cliente móvil sin IdP externo. get-or-create del usuario por email + token.
En producción (app_env != dev) responde 404. Producción real = IdP externo (§E.2).
"""
from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.api.composition_root import get_session
from src.config import settings
from src.contexts.identity.infrastructure.auth import decode_token
from src.main import app


def test_dev_login_issues_usable_token(db_session: Session) -> None:
    from seeds.identity_seed import seed_identity

    # The controller assigns role_key="normal_user" on get-or-create — that FK target only
    # exists once the identity reference data (roles/capabilities) has been seeded, which in
    # a real deploy happens once at setup time, long before any user signs up.
    seed_identity(db_session)
    app.dependency_overrides[get_session] = lambda: db_session
    try:
        client = TestClient(app)
        res = client.post("/v1/identity/dev-login", json={"email": "dev@cuadra.do"})
        assert res.status_code == 200, res.text
        body = res.json()
        claims = decode_token(body["access_token"])
        assert claims["sub"] == body["user_id"]          # el token lleva el user_id
        assert body["token_type"] == "bearer"

        # mismo email → MISMO usuario (get-or-create, no duplica)
        res2 = client.post("/v1/identity/dev-login", json={"email": "dev@cuadra.do"})
        assert res2.json()["user_id"] == body["user_id"]
    finally:
        app.dependency_overrides.clear()


def test_dev_login_works_without_prior_seed(db_session: Session) -> None:
    """10.C — el 500 histórico: sin `seed_identity` previo, asignar role_key='normal_user' violaba
    el FK a identity.role. dev-login ahora siembra la data de referencia (idempotente, solo-dev) →
    desbloquea el cliente en un entorno FRESCO sin un paso manual de seed.

    AÍSLA el bug: vacía la data de referencia dentro de la transacción (el DB de dev suele estar ya
    sembrado de corridas previas, lo que ENMASCARABA el 500) — así, sin el re-seed defensivo del
    handler, el INSERT de UserRoleModel violaría el FK y daría 500. El rollback del fixture restaura."""
    from src.contexts.identity.infrastructure.models import (
        RoleCapabilityModel,
        RoleModel,
        UserRoleModel,
    )

    db_session.query(UserRoleModel).delete()
    db_session.query(RoleCapabilityModel).delete()
    db_session.query(RoleModel).delete()
    db_session.flush()

    app.dependency_overrides[get_session] = lambda: db_session
    try:
        res = TestClient(app).post("/v1/identity/dev-login", json={"email": "fresh@cuadra.do"})
        assert res.status_code == 200, res.text  # antes del fix: 500 (FK violation)
    finally:
        app.dependency_overrides.clear()


def test_dev_login_can_request_super_admin(db_session: Session) -> None:
    """10.B — bootstrap de acceso admin local: pedir `role` asigna ese rol al usuario dev (además
    del normal_user base), para poder VER el admin sin sembrar un super_admin a mano."""
    from src.contexts.identity.infrastructure.models import UserRoleModel

    app.dependency_overrides[get_session] = lambda: db_session
    try:
        res = TestClient(app).post(
            "/v1/identity/dev-login",
            json={"email": "boss@cuadra.do", "role": "super_admin"},
        )
        assert res.status_code == 200, res.text
        user_id = res.json()["user_id"]
        roles = {
            r.role_key
            for r in db_session.query(UserRoleModel).filter_by(user_id=user_id).all()
        }
        assert "super_admin" in roles
    finally:
        app.dependency_overrides.clear()


def test_dev_login_unknown_role_is_422_not_500(db_session: Session) -> None:
    app.dependency_overrides[get_session] = lambda: db_session
    try:
        res = TestClient(app).post(
            "/v1/identity/dev-login",
            json={"email": "x@cuadra.do", "role": "wizard"},  # rol inexistente
        )
        assert res.status_code == 422, res.text
    finally:
        app.dependency_overrides.clear()


def test_dev_login_disabled_outside_dev(db_session: Session, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(settings, "app_env", "production")
    app.dependency_overrides[get_session] = lambda: db_session
    try:
        res = TestClient(app).post("/v1/identity/dev-login", json={"email": "x@y.do"})
        assert res.status_code == 404   # en prod no existe; el token lo emite el IdP externo
    finally:
        app.dependency_overrides.clear()
