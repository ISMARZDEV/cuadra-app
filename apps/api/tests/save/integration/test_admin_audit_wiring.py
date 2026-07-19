"""Integration — T2 wiring: una mutación del admin deja UNA fila de audit con el actor del request.

Prueba el CABLEADO (no la unidad): que el `get_admin_audit` está enganchado en los handlers y que
el actor viaja del token al audit log, en la MISMA transacción. Lección F0: una salvaguarda sin
test de wiring no existe.
"""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from seeds.identity_seed import seed_identity
from src.api.composition_root import get_session
from src.api.extensions.security import get_current_user_id
from src.contexts.identity.infrastructure.models import UserModel, UserRoleModel
from src.contexts.save.infrastructure.repositories import SqlAdminAuditRepository
from src.main import app


def _seed_admin(db_session) -> str:  # type: ignore[no-untyped-def]
    seed_identity(db_session)
    user = UserModel(
        email="ops@cuadra.do", name="ops", home_market_id="DO", current_market_id="DO"
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(UserRoleModel(user_id=user.id, role_key="super_admin"))
    db_session.flush()
    return str(user.id)


def _client(db_session, user_id: str) -> TestClient:  # type: ignore[no-untyped-def]
    app.dependency_overrides[get_session] = lambda: db_session
    app.dependency_overrides[get_current_user_id] = lambda: user_id
    return TestClient(app)


def test_create_basket_query_writes_audit_with_actor(db_session) -> None:  # type: ignore[no-untyped-def]
    actor = _seed_admin(db_session)
    market = f"T{uuid.uuid4().hex[:6]}"
    client = _client(db_session, actor)
    try:
        resp = client.post(
            "/v1/admin/save/basket-queries",
            json={"market_id": market, "query_text": "arroz la garza", "active": True},
        )
        assert resp.status_code == 201, resp.text
        query_id = resp.json()["id"]

        entries = SqlAdminAuditRepository(db_session).list_recent(market_id=market)
        assert len(entries) == 1
        e = entries[0]
        assert e.action == "basket.create"
        assert e.target_type == "basket_query"
        assert e.target_id == query_id
        assert e.actor_user_id == actor  # el actor del request, no un placeholder
        assert e.payload_summary["query_text"] == "arroz la garza"
    finally:
        app.dependency_overrides.clear()


def test_source_mutation_masks_the_secret_in_audit(db_session) -> None:  # type: ignore[no-untyped-def]
    """El secreto (auth.value) NUNCA entra al audit log — viaja enmascarado."""
    from src.contexts.save.domain.entities import (
        Provider,
        ProviderType,
        SourcePlatform,
    )
    from src.contexts.save.infrastructure.repositories import SqlProviderRepository

    actor = _seed_admin(db_session)
    prov = Provider(
        str(uuid.uuid4()), "Bravo", ProviderType.SUPERMARKET, SourcePlatform.REST_CATALOG, "DO"
    )
    SqlProviderRepository(db_session).add(prov)
    db_session.flush()
    client = _client(db_session, actor)
    try:
        resp = client.post(
            "/v1/admin/save/sources",
            json={
                "provider_id": prov.id, "platform": "rest_catalog",
                "base_url": "https://api.example.com",
                "auth": {"type": "api_key", "in": "header", "name": "X-Auth-Token",
                         "value": "SUPER-SECRET-TOKEN"},
            },
        )
        assert resp.status_code == 201, resp.text
        entries = SqlAdminAuditRepository(db_session).list_recent(market_id="DO")
        audited = next(e for e in entries if e.action == "source.create")
        blob = str(audited.payload_summary)
        assert "SUPER-SECRET-TOKEN" not in blob  # el secreto quedó fuera
    finally:
        app.dependency_overrides.clear()
