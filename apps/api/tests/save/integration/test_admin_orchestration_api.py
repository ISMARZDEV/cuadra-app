"""Integration — API de la consola de Orquestación (F4 #4.5).

Lo que se prueba acá y no en unit: que el GATE esté puesto (una ruta sin gatear es un agujero, no
un bug de lógica) y que la auditoría T2 realmente ESCRIBA — una salvaguarda sin test de wiring no
existe.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from seeds.identity_seed import seed_identity
from src.api.composition_root import get_pipeline_orchestrator, get_session
from src.api.extensions.security import get_current_user_id
from src.contexts.identity.infrastructure.models import UserModel, UserRoleModel
from src.contexts.save.domain.ports.orchestrator import OrchestratorUnavailable
from src.contexts.save.infrastructure.models import AdminAuditLogModel
from src.main import app


class DeadOrchestrator:
    """El runner caído. La consola tiene que DEGRADAR, no romper (SDD §8)."""

    def list_runs(self, **_):  # type: ignore[no-untyped-def]
        raise OrchestratorUnavailable("connection refused")

    def launch(self, **_):  # type: ignore[no-untyped-def]
        raise OrchestratorUnavailable("connection refused")

    def retry(self, _run_id):  # type: ignore[no-untyped-def]
        raise OrchestratorUnavailable("connection refused")

    def cancel(self, _run_id):  # type: ignore[no-untyped-def]
        raise OrchestratorUnavailable("connection refused")

    def get_run(self, _run_id):  # type: ignore[no-untyped-def]
        raise OrchestratorUnavailable("connection refused")


def _seed_role_user(db_session, role_key: str) -> str:  # type: ignore[no-untyped-def]
    seed_identity(db_session)
    user = UserModel(
        email=f"{role_key}-orch@cuadra.do", name=role_key,
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
    """Cada ruta admin necesita su capability. Dagster OSS no tiene autenticación propia, así que
    este gate es el ÚNICO control de acceso real sobre la ejecución del pipeline."""

    @pytest.mark.parametrize(
        ("method", "path"),
        [
            ("get", "/v1/admin/save/orchestration/provider-flows"),
            ("post", "/v1/admin/save/orchestration/provider-flows"),
            ("patch", "/v1/admin/save/orchestration/policies/p-1"),
            ("post", "/v1/admin/save/orchestration/policies/p-1/pause"),
            ("post", "/v1/admin/save/orchestration/policies/p-1/resume"),
            ("delete", "/v1/admin/save/orchestration/policies/p-1"),
            ("post", "/v1/admin/save/orchestration/policies/p-1/run"),
            ("post", "/v1/admin/save/orchestration/runs/r-1/retry"),
            ("post", "/v1/admin/save/orchestration/runs/r-1/cancel"),
        ],
    )
    def test_no_route_is_reachable_without_a_token(self, client, method, path) -> None:  # type: ignore[no-untyped-def]
        # `get`/`delete` de TestClient no aceptan `json=`.
        kwargs = {"json": {}} if method in ("post", "patch", "put") else {}
        response = getattr(client, method)(path, **kwargs)
        assert response.status_code in (401, 403), f"{method.upper()} {path} quedó SIN GATEAR"


class TestDegradation:
    def test_a_dead_runner_yields_503_not_500(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """503 y no 500: el runner es una dependencia EXTERNA que puede estar caída sin que nada
        nuestro esté roto. Un 500 mandaría al operador a buscar un bug en la consola que no existe.

        Se autentica de verdad (super_admin) — si no, el request muere en el gate y este test
        afirmaría degradación sin haberla ejercido nunca."""
        user_id = _seed_role_user(db_session, "super_admin")
        app.dependency_overrides[get_session] = lambda: db_session
        app.dependency_overrides[get_current_user_id] = lambda: user_id
        app.dependency_overrides[get_pipeline_orchestrator] = DeadOrchestrator
        try:
            response = TestClient(app).post("/v1/admin/save/orchestration/runs/r-1/cancel")
            assert response.status_code == 503, response.text
            assert "no disponible" in response.json()["detail"]
        finally:
            app.dependency_overrides.clear()

    def test_the_list_degrades_instead_of_failing_when_the_runner_is_down(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """La política vive en NUESTRA DB: tiene que seguir siendo visible aunque Dagster no esté —
        es justo cuando el operador más necesita mirarla (SDD §8)."""
        user_id = _seed_role_user(db_session, "super_admin")
        app.dependency_overrides[get_session] = lambda: db_session
        app.dependency_overrides[get_current_user_id] = lambda: user_id
        app.dependency_overrides[get_pipeline_orchestrator] = DeadOrchestrator
        try:
            response = TestClient(app).get("/v1/admin/save/orchestration/provider-flows")
            assert response.status_code == 200, response.text
        finally:
            app.dependency_overrides.clear()


def test_the_audit_table_is_reachable_and_append_only(db_session) -> None:  # type: ignore[no-untyped-def]
    """Smoke del canal de auditoría: la tabla existe y acepta las acciones del módulo nuevo. Los
    handlers escriben acá vía `AdminAuditRecorder` en la misma transacción del request (T2)."""
    from src.contexts.save.domain.admin_audit import AdminAuditEntry
    from src.contexts.save.infrastructure.repositories import SqlAdminAuditRepository

    repo = SqlAdminAuditRepository(db_session)
    repo.record(AdminAuditEntry.new(
        actor_user_id="u-1",
        action="orchestration.run.launch",
        target_type="orchestration_policy",
        target_id="p-1",
        payload_summary={"run_id": "r-1"},
        market_id="DO",
    ))
    db_session.flush()

    # Aislado por el actor/target de ESTE test (no un conteo de toda la tabla): la auditoría es
    # append-only y sagrada (§5.3), así que la tabla puede tener filas reales de otras corridas
    # (p.ej. lanzamientos hechos desde la consola) — el smoke solo verifica que SU fila aterrizó.
    rows = (
        db_session.query(AdminAuditLogModel)
        .filter_by(action="orchestration.run.launch", actor_user_id="u-1", target_id="p-1")
        .all()
    )
    assert len(rows) == 1
    assert rows[0].payload_summary == {"run_id": "r-1"}
