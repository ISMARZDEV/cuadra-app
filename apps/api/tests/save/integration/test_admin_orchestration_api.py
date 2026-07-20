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


class _RunsByState:
    """Runner que SÍ distingue `states` — sin esto el test no probaría nada.

    El fake anterior acepta `**_` y devuelve siempre lo mismo, así que el filtro por estado podría
    no existir y la suite seguiría verde: exactamente el "fake que confirma una firma inventada" que
    documenta `test_orchestration_protocol_conformance.py`.
    """

    def __init__(self, last, success) -> None:  # type: ignore[no-untyped-def]
        self._last = last
        self._success = success

    def list_runs(self, *, policy_id: str, limit: int = 20, states=None):  # type: ignore[no-untyped-def]
        del policy_id, limit
        if states:  # se pidió filtrando: solo corridas exitosas
            return [self._success] if self._success else []
        return [self._last] if self._last else []

    def launch(self, **_):  # type: ignore[no-untyped-def]
        raise AssertionError("no debería lanzarse en este test")

    def retry(self, _run_id):  # type: ignore[no-untyped-def] ...
        raise AssertionError

    def cancel(self, _run_id):  # type: ignore[no-untyped-def]
        raise AssertionError

    def get_run(self, _run_id):  # type: ignore[no-untyped-def]
        return None


class TestSlaIsComputedFromTheLastSUCCESSFULRun:
    """La regla cerrada el 2026-07-19: `(ahora − última corrida EXITOSA) ≤ sla_minutes`.

    Se prueba por la API y no solo en el dominio porque lo que puede romperse es el CABLEADO: que el
    controller pida la corrida exitosa y no la última a secas. Una salvaguarda sin test de wiring no
    existe (plan maestro §6.1).
    """

    # Ids REALES: la columna es UUID, así que un "pol-sla" legible revienta en el repo.
    POLICY_ID = "11111111-1111-4111-8111-111111111111"
    PROVIDER_ID = "22222222-2222-4222-8222-222222222222"

    def _seed_cron_policy(self, db_session, sla_minutes: int = 120) -> None:  # type: ignore[no-untyped-def]
        from src.contexts.save.domain.entities.orchestration import (
            ExecutionMode,
            FlowKey,
            OrchestrationPolicy,
            PolicyScope,
        )
        from src.contexts.save.infrastructure.models import ProviderModel
        from src.contexts.save.infrastructure.orchestrator.policy_repository import (
            SqlOrchestrationPolicyRepository,
        )

        # La policy tiene FK al provider: sin sembrarlo, el insert muere por integridad referencial.
        db_session.add(
            ProviderModel(
                id=self.PROVIDER_ID, name="SLA Test", type="supermarket",
                platform="vtex", market_id="DO",
            )
        )
        db_session.flush()

        # `add`, no `save`: `save` solo actualiza campos editables de una policy que ya existe.
        SqlOrchestrationPolicyRepository(db_session).add(
            OrchestrationPolicy(
                id=self.POLICY_ID,
                scope=PolicyScope.PROVIDER_FLOW,
                market_id="DO",
                timezone="America/Santo_Domingo",
                provider_id=self.PROVIDER_ID,
                flow_key=FlowKey.PROVIDER_PRICES_REFRESH,
                execution_mode=ExecutionMode.CRON,
                cron_expression="0 6 * * *",
                sla_minutes=sla_minutes,
            )
        )
        db_session.flush()

    def _call(self, db_session, user_id: str, orchestrator):  # type: ignore[no-untyped-def]
        app.dependency_overrides[get_session] = lambda: db_session
        app.dependency_overrides[get_current_user_id] = lambda: user_id
        app.dependency_overrides[get_pipeline_orchestrator] = lambda: orchestrator
        try:
            res = TestClient(app).get("/v1/admin/save/orchestration/provider-flows")
            assert res.status_code == 200, res.text
            return next(
                f for f in res.json()["flows"] if f["policy"]["policy_id"] == self.POLICY_ID
            )
        finally:
            app.dependency_overrides.clear()

    def test_a_recent_success_is_within_sla(self, db_session) -> None:  # type: ignore[no-untyped-def]
        from datetime import UTC, datetime, timedelta

        from src.contexts.save.domain.entities.orchestration_run import RunState
        from src.contexts.save.domain.ports.orchestrator import OrchestrationRun

        user_id = _seed_role_user(db_session, "super_admin")
        self._seed_cron_policy(db_session)
        ok = OrchestrationRun(
            run_id="r-ok", job_name="j", state=RunState.SUCCEEDED,
            ended_at=datetime.now(UTC) - timedelta(minutes=30),
        )

        row = self._call(db_session, user_id, _RunsByState(last=ok, success=ok))

        assert row["sla_status"] == "within"

    def test_a_failing_flow_does_NOT_inherit_freshness_from_its_failed_run(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """El corazón de la regla: la ÚLTIMA corrida es de hace un minuto, pero FALLÓ. El último
        ÉXITO es de hace 5 horas → incumplido. Si el controller mirara la última corrida a secas,
        un flujo que falla cada minuto parecería el más fresco de todos."""
        from datetime import UTC, datetime, timedelta

        from src.contexts.save.domain.entities.orchestration_run import RunState
        from src.contexts.save.domain.ports.orchestrator import OrchestrationRun

        user_id = _seed_role_user(db_session, "super_admin")
        self._seed_cron_policy(db_session)
        now = datetime.now(UTC)
        failed_just_now = OrchestrationRun(
            run_id="r-bad", job_name="j", state=RunState.FAILED,
            ended_at=now - timedelta(minutes=1),
        )
        old_success = OrchestrationRun(
            run_id="r-old", job_name="j", state=RunState.SUCCEEDED,
            ended_at=now - timedelta(hours=5),
        )

        row = self._call(db_session, user_id, _RunsByState(last=failed_just_now, success=old_success))

        assert row["sla_status"] == "breached"
        assert row["last_run_state"] == "failed"

    def test_never_succeeded_is_breached_not_silently_ok(self, db_session) -> None:  # type: ignore[no-untyped-def]
        from datetime import UTC, datetime, timedelta

        from src.contexts.save.domain.entities.orchestration_run import RunState
        from src.contexts.save.domain.ports.orchestrator import OrchestrationRun

        user_id = _seed_role_user(db_session, "super_admin")
        self._seed_cron_policy(db_session)
        failed = OrchestrationRun(
            run_id="r-bad", job_name="j", state=RunState.FAILED,
            ended_at=datetime.now(UTC) - timedelta(minutes=1),
        )

        row = self._call(db_session, user_id, _RunsByState(last=failed, success=None))

        assert row["sla_status"] == "breached"
        assert row["last_success_at"] is None


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
