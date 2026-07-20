"""Integration — API de la consola de Orquestación (F4 #4.5).

Lo que se prueba acá y no en unit: que el GATE esté puesto (una ruta sin gatear es un agujero, no
un bug de lógica) y que la auditoría T2 realmente ESCRIBA — una salvaguarda sin test de wiring no
existe.
"""
from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from seeds.identity_seed import seed_identity
from src.api.composition_root import get_pipeline_orchestrator, get_session
from src.api.extensions.security import get_current_user_id
from src.contexts.identity.infrastructure.models import UserModel, UserRoleModel
from src.contexts.save.domain.ports.orchestrator import (
    AssetPartitionStats,
    OrchestratorUnavailable,
    PipelineAsset,
)
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

    def list_assets(self):  # type: ignore[no-untyped-def]
        raise OrchestratorUnavailable("connection refused")

    def get_asset(self, _key):  # type: ignore[no-untyped-def]
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
            ("get", "/v1/admin/save/orchestration/assets"),
            ("get", "/v1/admin/save/orchestration/assets/query_catalog_prices"),
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


# ------------------------------------------------------------------------------- assets (#9) --


class _AssetsOrchestrator:
    """Fake con assets. NO usa `**_`: un fake permisivo deja invisible un argumento nuevo del puerto
    (gotcha #21) — el mismo agujero que dejó `states=` sin cobertura cuando se agregó."""

    def __init__(self, assets: list[PipelineAsset], detail: PipelineAsset | None = None):
        self._assets = assets
        self._detail = detail
        self.asked_for: list[str] = []

    def list_assets(self):  # type: ignore[no-untyped-def]
        return self._assets

    def get_asset(self, key):  # type: ignore[no-untyped-def]
        self.asked_for.append(key)
        return self._detail

    def list_runs(self, **_):  # type: ignore[no-untyped-def]
        return []

    def launch(self, **_):  # type: ignore[no-untyped-def]
        raise AssertionError("una LECTURA de assets no debe lanzar corridas")

    def retry(self, _run_id):  # type: ignore[no-untyped-def]
        raise AssertionError("una LECTURA de assets no debe reintentar nada")

    def cancel(self, _run_id):  # type: ignore[no-untyped-def]
        raise AssertionError("una LECTURA de assets no debe cancelar nada")

    def get_run(self, _run_id):  # type: ignore[no-untyped-def]
        return None


def _pipeline_asset(**over):  # type: ignore[no-untyped-def]
    base = {
        "key": "query_catalog_prices",
        "group": "default",
        "description": "Descubrimiento por-query",
        "job_names": ("save_query_catalog",),
        "dependency_keys": (),
        "depended_by_keys": (),
        "partitions": None,
        "last_materialized_at": None,
        "last_run_id": None,
    }
    base.update(over)
    return PipelineAsset(**base)  # type: ignore[arg-type]


class TestListAssetsEndpoint:
    def _get(self, db_session, user_id, orchestrator, path="/assets"):  # type: ignore[no-untyped-def]
        app.dependency_overrides[get_session] = lambda: db_session
        app.dependency_overrides[get_current_user_id] = lambda: user_id
        app.dependency_overrides[get_pipeline_orchestrator] = lambda: orchestrator
        try:
            with TestClient(app) as c:
                return c.get(f"/v1/admin/save/orchestration{path}")
        finally:
            app.dependency_overrides.clear()

    def test_exposes_the_aggregate_of_a_partitioned_asset_as_ONE_row(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """US-OR-L4 lo pide explícito: `rest_catalog_prices` es UNA fila con su estado agregado, no
        una fila por sección. Con 40+ secciones, una fila por partición ahogaría la tabla."""
        user_id = _seed_role_user(db_session, "super_admin")
        asset = _pipeline_asset(
            key="rest_catalog_prices",
            partitions=AssetPartitionStats(total=10, materialized=8, failed=1, materializing=1),
            last_materialized_at=datetime(2026, 7, 20, tzinfo=UTC),
            last_run_id="r-1",
        )

        res = self._get(db_session, user_id, _AssetsOrchestrator([asset]))

        assert res.status_code == 200
        row = res.json()["assets"][0]
        assert row["key"] == "rest_catalog_prices"
        assert row["partitions"]["total"] == 10
        assert row["partitions"]["coverage_ratio"] == 0.8
        assert row["health"] == "degraded"

    def test_a_non_partitioned_asset_reports_NO_partitions_instead_of_zeroes(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "super_admin")

        res = self._get(db_session, user_id, _AssetsOrchestrator([_pipeline_asset()]))

        assert res.json()["assets"][0]["partitions"] is None

    def test_a_dead_runner_is_a_503_not_an_empty_pipeline(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """A diferencia de `/provider-flows`, acá NO se puede degradar: las policies viven en NUESTRA
        DB, pero los assets viven SOLO en Dagster. Devolver `[]` diría "el pipeline no tiene assets"
        cuando la verdad es "no pudimos preguntar" — la mentira más cara que este módulo puede
        contar."""
        user_id = _seed_role_user(db_session, "super_admin")

        res = self._get(db_session, user_id, DeadOrchestrator())

        assert res.status_code == 503

    def test_the_detail_carries_the_lineage_in_both_directions(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_role_user(db_session, "super_admin")
        detail = _pipeline_asset(
            dependency_keys=("embed_canonicals",),
            depended_by_keys=("price_drops",),
            last_materialized_at=datetime(2026, 7, 20, tzinfo=UTC),
        )

        res = self._get(
            db_session, user_id, _AssetsOrchestrator([], detail), "/assets/query_catalog_prices",
        )

        assert res.status_code == 200
        lineage = res.json()["lineage"]
        assert {"key": "embed_canonicals", "direction": "upstream"} in lineage
        assert {"key": "price_drops", "direction": "downstream"} in lineage

    def test_an_unknown_asset_is_a_404_not_a_503(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """"Ese asset no existe" es una RESPUESTA del runner, no una caída suya. Devolver 503 haría
        que la consola dijera "el orquestador no responde" con el orquestador contestando."""
        user_id = _seed_role_user(db_session, "super_admin")
        orchestrator = _AssetsOrchestrator([], None)

        res = self._get(db_session, user_id, orchestrator, "/assets/no_existe")

        assert res.status_code == 404
        # Sin esto el test pasaría con la RUTA INEXISTENTE (FastAPI también contesta 404), o sea
        # afirmando un comportamiento que nadie implementó. Exigir que el puerto haya sido consultado
        # es lo que distingue "el runner dijo que no existe" de "no llegamos ni a preguntar".
        assert orchestrator.asked_for == ["no_existe"]

    def test_a_slashed_key_reaches_the_port_intact(self, db_session) -> None:  # type: ignore[no-untyped-def]
        """`AssetKey` es una LISTA de segmentos; la clave de la URL los une con `/`. Si la ruta no
        acepta el path completo, todo asset multi-segmento sería inalcanzable."""
        user_id = _seed_role_user(db_session, "super_admin")
        orchestrator = _AssetsOrchestrator([], _pipeline_asset(key="save/prices"))

        res = self._get(db_session, user_id, orchestrator, "/assets/save/prices")

        assert res.status_code == 200
        assert orchestrator.asked_for == ["save/prices"]
