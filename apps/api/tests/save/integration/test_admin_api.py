"""Integration — RBAC + bulk-resolve del controller `admin_save` (F2 · B1, tareas 1.21-1.25).

RBAC: cada ruta `/admin/save/*` exige `ADMIN_SAVE_MATCHING_REVIEW` server-side (SACRED — un
gate solo-cliente no cuenta). `get_current_user_id` se overridea directo al `user.id` sembrado
(evita fabricar JWTs reales; el enrutado RS256/HS256 de `get_current_user_id` ya lo cubre
`test_auth_routing.py` — acá el objetivo es probar el gate de capability).

Bulk-resolve: cada fila se resuelve de forma ATÓMICA e INDEPENDIENTE — el fallo de una fila
(reason_code faltante al rechazar) no debe arrastrar ni silenciar las demás.
"""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from seeds.identity_seed import seed_identity
from src.api.composition_root import get_session
from src.api.extensions.security import get_current_user_id
from src.contexts.identity.infrastructure.models import UserModel, UserRoleModel
from src.contexts.save.infrastructure.matching.repository.product_match_repository import (
    SqlProductMatchRepository,
)
from src.main import app

from .test_product_match_repository import _seed_provider_and_canonical, _seed_store_product


def _seed_role_user(db_session, role_key: str) -> str:  # type: ignore[no-untyped-def]
    seed_identity(db_session)
    user = UserModel(
        email=f"{role_key}@cuadra.do", name=role_key, home_market_id="DO", current_market_id="DO"
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(UserRoleModel(user_id=user.id, role_key=role_key))
    db_session.flush()
    return str(user.id)


def _seed_pending_match(db_session) -> str:  # type: ignore[no-untyped-def]
    pid, _cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid)
    repo = SqlProductMatchRepository(db_session)
    return repo.record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=0.4, method="llm", status="pending_review",
    )


def _provider_of(db_session, match_id: str) -> str:  # type: ignore[no-untyped-def]
    """Proveedor de la fila sembrada, para ACOTAR la cola a ella.

    Estos tests corren contra la DB de desarrollo (`settings.database_url`) dentro de una
    transacción que se revierte: eso aísla lo que ESCRIBEN, no lo que ya había. La cola real
    acumula matches pendientes de cada ingesta (155 al escribir esto), y la página por defecto
    son 50 — así que asumir que la fila recién sembrada aparece en `rows` era depender de que
    la base estuviera vacía. Lo estaba cuando se escribieron; dejó de estarlo al ingerir de
    verdad, y el test empezó a fallar sin que nada del código se rompiera.

    `_seed_provider_and_canonical` genera un `provider_id` nuevo por llamada, así que filtrar
    por él deja la aserción determinista sin importar cuánto haya en la cola.
    """
    from src.contexts.save.infrastructure.models import ProductMatchModel, StoreProductModel

    match = db_session.get(ProductMatchModel, uuid.UUID(match_id))
    return str(db_session.get(StoreProductModel, match.store_product_id).provider_id)


def _client(db_session, user_id: str) -> TestClient:  # type: ignore[no-untyped-def]
    app.dependency_overrides[get_session] = lambda: db_session
    app.dependency_overrides[get_current_user_id] = lambda: user_id
    return TestClient(app)


def _clear() -> None:
    app.dependency_overrides.clear()


def test_non_admin_gets_403_on_every_admin_save_route(db_session) -> None:  # type: ignore[no-untyped-def]
    user_id = _seed_role_user(db_session, "normal_user")
    match_id = _seed_pending_match(db_session)
    client = _client(db_session, user_id)
    try:
        assert client.get("/v1/admin/save/review-queue").status_code == 403
        assert client.get(f"/v1/admin/save/review-queue/{match_id}").status_code == 403
        assert (
            client.post(
                f"/v1/admin/save/review-queue/{match_id}/resolve",
                json={"decided_by": user_id, "reason_code": "different_size"},
            ).status_code
            == 403
        )
        assert (
            client.post(
                "/v1/admin/save/review-queue/create-canonical",
                json={
                    "match_id": match_id, "decided_by": user_id, "name": "x", "brand": "x",
                    "quantity_amount": "1", "quantity_measure": "count",
                    "taxonomy_node_id": str(uuid.uuid4()), "market_id": "DO",
                },
            ).status_code
            == 403
        )
        assert (
            client.post(
                "/v1/admin/save/review-queue/bulk-resolve",
                json={"rows": [{"match_id": match_id, "decided_by": user_id}]},
            ).status_code
            == 403
        )
    finally:
        _clear()


def test_super_admin_gets_200_on_review_queue_routes(db_session) -> None:  # type: ignore[no-untyped-def]
    admin_id = _seed_role_user(db_session, "super_admin")
    match_id = _seed_pending_match(db_session)
    client = _client(db_session, admin_id)
    try:
        r_list = client.get(
            "/v1/admin/save/review-queue",
            params={"market": "DO", "provider_id": _provider_of(db_session, match_id)},
        )
        assert r_list.status_code == 200, r_list.text
        assert any(row["match_id"] == match_id for row in r_list.json()["rows"])

        r_detail = client.get(f"/v1/admin/save/review-queue/{match_id}")
        assert r_detail.status_code == 200, r_detail.text
        assert r_detail.json()["match_id"] == match_id
    finally:
        _clear()


def test_review_queue_run_id_query_filters_end_to_end(db_session) -> None:  # type: ignore[no-untyped-def]
    """Deep-link corrida→cola (F4 #4.7) cableado de punta a punta: el query param `?run_id=` del
    endpoint acota la cola a los matches de UNA corrida. Prueba el WIRING controller→use-case→repo,
    no solo la unidad (el filtro existía en el repo; que el endpoint lo pase es lo que valida el
    deep-link de la consola)."""
    admin_id = _seed_role_user(db_session, "super_admin")
    pid, _cid = _seed_provider_and_canonical(db_session)
    repo = SqlProductMatchRepository(db_session)
    m_run_a = repo.record_match(
        store_product_id=_seed_store_product(db_session, pid), canonical_product_id=None,
        confidence=0.4, method="llm", status="pending_review", run_id="run-aaa",
    )
    m_run_b = repo.record_match(
        store_product_id=_seed_store_product(db_session, pid), canonical_product_id=None,
        confidence=0.4, method="llm", status="pending_review", run_id="run-bbb",
    )
    client = _client(db_session, admin_id)
    try:
        res = client.get(
            "/v1/admin/save/review-queue", params={"market": "DO", "run_id": "run-aaa"}
        )
        assert res.status_code == 200, res.text
        ids = [row["match_id"] for row in res.json()["rows"]]
        assert m_run_a in ids
        assert m_run_b not in ids
    finally:
        _clear()


def test_super_admin_gets_200_on_resolve(db_session) -> None:  # type: ignore[no-untyped-def]
    admin_id = _seed_role_user(db_session, "super_admin")
    match_id = _seed_pending_match(db_session)
    client = _client(db_session, admin_id)
    try:
        r = client.post(
            f"/v1/admin/save/review-queue/{match_id}/resolve",
            json={"decided_by": admin_id, "reason_code": "different_size"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "rejected"
    finally:
        _clear()


def test_super_admin_gets_201_on_create_canonical(db_session) -> None:  # type: ignore[no-untyped-def]
    admin_id = _seed_role_user(db_session, "super_admin")
    match_id = _seed_pending_match(db_session)
    _, existing_cid = _seed_provider_and_canonical(db_session)
    client = _client(db_session, admin_id)
    try:
        r = client.post(
            "/v1/admin/save/review-queue/create-canonical",
            json={
                "match_id": match_id, "decided_by": admin_id, "name": "Producto Nuevo",
                "brand": "Marca", "quantity_amount": "500", "quantity_measure": "mass",
                "taxonomy_node_id": _taxonomy_node_id_of(db_session, existing_cid),
                "market_id": "DO",
            },
        )
        assert r.status_code == 201, r.text
        assert "canonical_product_id" in r.json()
    finally:
        _clear()


def _taxonomy_node_id_of(db_session, canonical_product_id: str) -> str:  # type: ignore[no-untyped-def]
    from src.contexts.save.infrastructure.models import CanonicalProductModel

    row = db_session.get(CanonicalProductModel, uuid.UUID(canonical_product_id))
    return str(row.taxonomy_node_id)


def test_super_admin_gets_200_on_bulk_resolve(db_session) -> None:  # type: ignore[no-untyped-def]
    admin_id = _seed_role_user(db_session, "super_admin")
    match_id = _seed_pending_match(db_session)
    client = _client(db_session, admin_id)
    try:
        r = client.post(
            "/v1/admin/save/review-queue/bulk-resolve",
            json={
                "rows": [
                    {"match_id": match_id, "decided_by": admin_id, "reason_code": "different_size"}
                ]
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["succeeded"] == [match_id]
        assert body["failed"] == []
    finally:
        _clear()


def test_bulk_resolve_is_per_row_atomic_and_reports_partial_failure(db_session) -> None:  # type: ignore[no-untyped-def]
    """Una fila inválida (sin reason_code al rechazar) NO debe arrastrar a las demás filas —
    la fila válida se confirma, la inválida se reporta en `failed`, ninguna se pierde en silencio."""
    admin_id = _seed_role_user(db_session, "super_admin")
    good_match_id = _seed_pending_match(db_session)
    bad_match_id = _seed_pending_match(db_session)
    client = _client(db_session, admin_id)
    try:
        r = client.post(
            "/v1/admin/save/review-queue/bulk-resolve",
            json={
                "rows": [
                    {
                        "match_id": good_match_id, "decided_by": admin_id,
                        "reason_code": "different_size",
                    },
                    {"match_id": bad_match_id, "decided_by": admin_id},  # sin reason_code -> falla
                ]
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["succeeded"] == [good_match_id]
        assert len(body["failed"]) == 1
        assert body["failed"][0]["match_id"] == bad_match_id
        assert "reason_code" in body["failed"][0]["error"]

        # la fila buena SÍ persistió pese al fallo de la otra en el mismo lote/misma Session
        from src.contexts.save.infrastructure.models import ProductMatchModel

        good_row = db_session.get(ProductMatchModel, uuid.UUID(good_match_id))
        assert good_row.status == "rejected"
        bad_row = db_session.get(ProductMatchModel, uuid.UUID(bad_match_id))
        assert bad_row.status == "pending_review"  # sin cambios: el fallo no escribió nada
    finally:
        _clear()


# ------------------------------------------------- clasificación en lote + override manual (D8) --

def _seed_taxonomy_leaf(db_session, name: str = "Zarandaja") -> tuple[str, str]:  # type: ignore[no-untyped-def]
    """(top_id, leaf_id) — la taxonomía es de DOS niveles y la clasificación guarda la HOJA,
    mientras el badge de la cola muestra su TOPE."""
    from src.contexts.save.infrastructure.models import TaxonomyNodeModel

    top = TaxonomyNodeModel(name="Despensa", level=0, market_id="DO", parent_id=None)
    db_session.add(top)
    db_session.flush()
    leaf = TaxonomyNodeModel(name=name, level=1, market_id="DO", parent_id=top.id)
    db_session.add(leaf)
    db_session.flush()
    return str(top.id), str(leaf.id)


def _store_product_of(db_session, match_id: str) -> str:  # type: ignore[no-untyped-def]
    from src.contexts.save.infrastructure.models import ProductMatchModel

    return str(db_session.get(ProductMatchModel, uuid.UUID(match_id)).store_product_id)


class TestTaxonomyLeavesEndpoint:
    """`GET /taxonomy` — las hojas CON su id.

    Existe porque el endpoint público `/v1/save/categories` devuelve `slug` y `name`, NO ids, y
    fijar una categoría necesita el `taxonomy_node_id`. Sin esto el combobox de la celda editable
    no tendría qué mandar.
    """

    def test_returns_leaves_with_their_id_and_top_name(self, db_session) -> None:  # type: ignore[no-untyped-def]
        admin_id = _seed_role_user(db_session, "super_admin")
        _top, leaf_id = _seed_taxonomy_leaf(db_session)
        client = _client(db_session, admin_id)
        try:
            res = client.get("/v1/admin/save/taxonomy")
        finally:
            _clear()

        assert res.status_code == 200, res.text
        leaves = res.json()["leaves"]
        hoja = next(x for x in leaves if x["id"] == leaf_id)
        # El TOPE viaja con la hoja: "Arroz" solo es ambiguo entre categorías, y el operador elige
        # mirando "Despensa › Arroz".
        assert hoja["name"] == "Zarandaja"
        assert hoja["top_name"] == "Despensa"


class TestSetCategoryEndpoint:
    """`PUT /store-products/{id}/category` — el override HUMANO que faltaba."""

    def test_sets_the_category_and_the_queue_row_reflects_it(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Se prueba de punta a punta —fijar y volver a LEER la cola— porque lo que puede romperse
        es el cableado: la cola deriva su badge de la clasificación `active` → hoja → TOPE, y un
        override que escriba en otro sitio no aparecería nunca."""
        admin_id = _seed_role_user(db_session, "super_admin")
        match_id = _seed_pending_match(db_session)
        _top, leaf_id = _seed_taxonomy_leaf(db_session)
        sp_id = _store_product_of(db_session, match_id)
        client = _client(db_session, admin_id)
        try:
            res = client.put(
                f"/v1/admin/save/store-products/{sp_id}/category",
                json={"taxonomy_node_id": leaf_id, "decided_by": admin_id},
            )
            queue = client.get(
                "/v1/admin/save/review-queue",
                params={"provider_id": _provider_of(db_session, match_id)},
            ).json()
        finally:
            _clear()

        assert res.status_code == 200, res.text
        row = next(r for r in queue["rows"] if r["match_id"] == match_id)
        assert row["category"] is not None
        assert row["category"]["name"] == "Despensa"  # el TOPE, no la hoja

    def test_an_empty_category_is_rejected_not_silently_stored(self, db_session) -> None:  # type: ignore[no-untyped-def]
        admin_id = _seed_role_user(db_session, "super_admin")
        match_id = _seed_pending_match(db_session)
        sp_id = _store_product_of(db_session, match_id)
        client = _client(db_session, admin_id)
        try:
            res = client.put(
                f"/v1/admin/save/store-products/{sp_id}/category",
                json={"taxonomy_node_id": "", "decided_by": admin_id},
            )
        finally:
            _clear()

        assert res.status_code == 422

    def test_requires_the_review_capability(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """Es una MUTACIÓN sobre el catálogo: el gate va server-side (SACRED)."""
        user_id = _seed_role_user(db_session, "normal_user")
        match_id = _seed_pending_match(db_session)
        sp_id = _store_product_of(db_session, match_id)
        client = _client(db_session, user_id)
        try:
            res = client.put(
                f"/v1/admin/save/store-products/{sp_id}/category",
                json={"taxonomy_node_id": str(uuid.uuid4()), "decided_by": user_id},
            )
        finally:
            _clear()

        assert res.status_code == 403


class TestBulkClassifyEndpoint:
    """`POST /review-queue/bulk-classify` — clasifica lo seleccionado.

    Corre SIN la etapa vectorial (la API no puede cargar BGE-M3: vive en el grupo `ingestion`), así
    que resuelve por léxico + señal de ORIGEN. Lo que no resuelva queda sin decidir, y el resumen lo
    DICE — un lote que clasifica 32 de 48 no se puede ver igual que uno que terminó.
    """

    def test_classifies_by_lexicon_without_any_model_loaded(self, db_session) -> None:  # type: ignore[no-untyped-def]
        admin_id = _seed_role_user(db_session, "super_admin")
        match_id = _seed_pending_match(db_session)
        _top, leaf_id = _seed_taxonomy_leaf(db_session)
        # El nombre del store_product sembrado contiene el token de la hoja → pega el léxico.
        from src.contexts.save.infrastructure.models import StoreProductModel

        sp = db_session.get(StoreProductModel, uuid.UUID(_store_product_of(db_session, match_id)))
        sp.name = "Zarandaja Selecta Bisono 5 Lb"
        db_session.flush()
        client = _client(db_session, admin_id)
        try:
            res = client.post(
                "/v1/admin/save/review-queue/bulk-classify",
                json={"match_ids": [match_id]},
            )
        finally:
            _clear()

        assert res.status_code == 200, res.text
        body = res.json()
        assert body["classified"] == 1
        assert body["undecided"] == 0
        assert body["rows"][0]["taxonomy_node_id"] == leaf_id

    def test_a_name_the_lexicon_cannot_resolve_is_reported_as_undecided_not_invented(
        self, db_session,  # type: ignore[no-untyped-def]
    ) -> None:
        """Sin etapa vectorial NO se inventa categoría: se cuenta como `undecided` para que el
        operador sepa que le quedan filas por mirar."""
        admin_id = _seed_role_user(db_session, "super_admin")
        match_id = _seed_pending_match(db_session)
        _seed_taxonomy_leaf(db_session)
        from src.contexts.save.infrastructure.models import StoreProductModel

        sp = db_session.get(StoreProductModel, uuid.UUID(_store_product_of(db_session, match_id)))
        sp.name = "Zzz Producto Sin Token Conocido"
        sp.source_category = ""
        db_session.flush()
        client = _client(db_session, admin_id)
        try:
            res = client.post(
                "/v1/admin/save/review-queue/bulk-classify",
                json={"match_ids": [match_id]},
            )
        finally:
            _clear()

        body = res.json()
        assert body["classified"] == 0
        assert body["undecided"] == 1
        assert body["rows"][0]["taxonomy_node_id"] is None

    def test_a_match_that_no_longer_exists_is_failed_not_dropped(self, db_session) -> None:  # type: ignore[no-untyped-def]
        admin_id = _seed_role_user(db_session, "super_admin")
        client = _client(db_session, admin_id)
        ghost = str(uuid.uuid4())
        try:
            res = client.post(
                "/v1/admin/save/review-queue/bulk-classify", json={"match_ids": [ghost]}
            )
        finally:
            _clear()

        body = res.json()
        assert body["classified"] == 0
        assert [f["match_id"] for f in body["failed"]] == [ghost]

    def test_requires_the_review_capability(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "normal_user")
        client = _client(db_session, user_id)
        try:
            res = client.post(
                "/v1/admin/save/review-queue/bulk-classify", json={"match_ids": []}
            )
        finally:
            _clear()

        assert res.status_code == 403
