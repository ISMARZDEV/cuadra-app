"""Unit — adapter GraphQL del runner (F4 #4.4). Sin red: se inyecta el transporte.

Todo lo que se afirma acá salió de INTROSPECTAR `dagster-graphql` 1.13.12 (el schema del paquete
instalado), no de la documentación — que ya se detectó desactualizada en esta misma integración.
"""
from __future__ import annotations

import pytest

from src.contexts.save.domain.entities.orchestration_run import RunState
from src.contexts.save.domain.ports.orchestrator import OrchestratorUnavailable, RunTrigger
from src.contexts.save.infrastructure.orchestrator.dagster_graphql import (
    DagsterGraphQLOrchestrator,
)

URL = "http://dagster.internal:3070/graphql"


class FakeTransport:
    """Sustituye el POST HTTP. Guarda lo enviado y devuelve lo guionado."""

    def __init__(self, responses: list[dict] | None = None, raises: Exception | None = None):
        self.calls: list[tuple[str, dict]] = []
        self._responses = responses or [{}]
        self._raises = raises

    def __call__(self, url: str, payload: dict, headers: dict[str, str]) -> dict:
        if self._raises is not None:
            raise self._raises
        self.calls.append((url, payload))
        return self._responses[min(len(self.calls) - 1, len(self._responses) - 1)]

    @property
    def last_variables(self) -> dict:
        return self.calls[-1][1]["variables"]

    @property
    def last_query(self) -> str:
        return self.calls[-1][1]["query"]


def _orchestrator(transport: FakeTransport) -> DagsterGraphQLOrchestrator:
    return DagsterGraphQLOrchestrator(url=URL, http_post=transport)


class TestLaunch:
    def test_returns_the_run_id_of_the_launched_run(self) -> None:
        transport = FakeTransport([
            {"data": {"repositoriesOrError": {"__typename": "RepositoryConnection", "nodes": [
                {"name": "__repository__", "location": {"name": "ingestion.definitions"}}]}}},
            {"data": {"launchRun": {"__typename": "LaunchRunSuccess", "run": {"runId": "r-1"}}}},
        ])

        run_id = _orchestrator(transport).launch(job_name="save_query_catalog", policy_id="pol-1")

        assert run_id == "r-1"
        assert "launchRun" in transport.last_query

    def test_tags_the_run_for_correlation_with_our_policy(self) -> None:
        """SIN esto, correlacionar una policy con sus corridas sería por nombre de job + ventana de
        tiempo — o sea, adivinar. `RunsFilter.tags` existe en el schema, así que la correlación es
        exacta y sobrevive a reinicios."""
        transport = FakeTransport([
            {"data": {"repositoriesOrError": {"__typename": "RepositoryConnection", "nodes": [
                {"name": "__repository__", "location": {"name": "ingestion.definitions"}}]}}},
            {"data": {"launchRun": {"__typename": "LaunchRunSuccess", "run": {"runId": "r-1"}}}},
        ])

        _orchestrator(transport).launch(
            job_name="save_query_catalog",
            policy_id="pol-1",
            trigger=RunTrigger.MANUAL,
            actor_user_id="u-9",
        )

        tags = {t["key"]: t["value"] for t in transport.last_variables["tags"]}
        assert tags["cuadra/policy_id"] == "pol-1"
        assert tags["cuadra/trigger"] == "manual"
        assert tags["cuadra/actor_user_id"] == "u-9"

    def test_a_partitioned_job_launches_with_the_dagster_partition_tag(self) -> None:
        """`save_query_catalog` está PARTICIONADO por provider_id: sin la partición, el run es
        no-particionado y el asset revienta con `Cannot access partition_key for a non-partitioned
        run` (verde en el borde —`launchRun` devuelve run_id— y roto 3s después en la corrida real).
        Dagster resuelve `context.partition_key` del tag `dagster/partition` (introspeccionado:
        `PARTITION_NAME_TAG`). El tag NO se importa de dagster (el adapter no puede, gotcha #1)."""
        transport = FakeTransport([
            {"data": {"repositoriesOrError": {"__typename": "RepositoryConnection", "nodes": [
                {"name": "__repository__", "location": {"name": "ingestion.definitions"}}]}}},
            {"data": {"launchRun": {"__typename": "LaunchRunSuccess", "run": {"runId": "r-1"}}}},
        ])

        _orchestrator(transport).launch(
            job_name="save_query_catalog", policy_id="pol-1", partition_key="prov-123",
        )

        tags = {t["key"]: t["value"] for t in transport.last_variables["tags"]}
        assert tags["dagster/partition"] == "prov-123"

    def test_an_unpartitioned_launch_sends_no_partition_tag(self) -> None:
        """Sin `partition_key` (job no particionado) NO se manda el tag — pasárselo a un job sin
        particiones rompería del lado opuesto ("job is not partitioned")."""
        transport = FakeTransport([
            {"data": {"repositoriesOrError": {"__typename": "RepositoryConnection", "nodes": [
                {"name": "__repository__", "location": {"name": "ingestion.definitions"}}]}}},
            {"data": {"launchRun": {"__typename": "LaunchRunSuccess", "run": {"runId": "r-1"}}}},
        ])

        _orchestrator(transport).launch(job_name="save_coverage", policy_id="pol-1")

        keys = {t["key"] for t in transport.last_variables["tags"]}
        assert "dagster/partition" not in keys

    def test_a_launch_rejected_by_the_runner_is_not_reported_as_success(self) -> None:
        """`launchRun` devuelve una UNION: el error viaja en `__typename` con HTTP 200. Leer
        `run.runId` a ciegas daría un KeyError críptico o, peor, un id vacío que la consola
        mostraría como corrida real."""
        transport = FakeTransport([
            {"data": {"repositoriesOrError": {"__typename": "RepositoryConnection", "nodes": [
                {"name": "__repository__", "location": {"name": "ingestion.definitions"}}]}}},
            {"data": {"launchRun": {"__typename": "RunConfigValidationInvalid",
                                    "message": "config inválida"}}},
        ])

        with pytest.raises(OrchestratorUnavailable, match="config inválida"):
            _orchestrator(transport).launch(job_name="save_query_catalog", policy_id="pol-1")


class TestRetryAndCancel:
    def test_retry_resumes_from_the_failure_instead_of_rerunning_everything(self) -> None:
        """`ReexecutionStrategy` real = ALL_STEPS | FROM_FAILURE | FROM_ASSET_FAILURE.
        `FROM_FAILURE` es la semántica oficial de retry: re-correr todo sería otra corrida."""
        transport = FakeTransport([
            {"data": {"launchRunReexecution": {"__typename": "LaunchRunSuccess",
                                               "run": {"runId": "r-2"}}}}
        ])

        run_id = _orchestrator(transport).retry("r-1")

        assert run_id == "r-2"
        assert transport.last_variables["parentRunId"] == "r-1"
        assert transport.last_variables["strategy"] == "FROM_FAILURE"

    def test_cancel_terminates_the_run(self) -> None:
        transport = FakeTransport([
            {"data": {"terminateRun": {"__typename": "TerminateRunSuccess"}}}
        ])

        _orchestrator(transport).cancel("r-1")

        assert transport.last_variables["runId"] == "r-1"
        assert "terminateRun" in transport.last_query


class TestListRuns:
    def test_translates_runner_states_into_operator_vocabulary(self) -> None:
        transport = FakeTransport([
            {"data": {"runsOrError": {"__typename": "Runs", "results": [
                {"runId": "r-1", "jobName": "save_query_catalog", "status": "SUCCESS",
                 "startTime": 1000.0, "endTime": 1060.0, "tags": []},
                {"runId": "r-2", "jobName": "save_query_catalog", "status": "STARTING",
                 "startTime": 2000.0, "endTime": None, "tags": []},
            ]}}}
        ])

        runs = _orchestrator(transport).list_runs(policy_id="pol-1")

        assert [r.state for r in runs] == [RunState.SUCCEEDED, RunState.RUNNING]
        assert runs[0].duration_seconds == 60

    def test_filters_by_the_policy_tag(self) -> None:
        transport = FakeTransport([{"data": {"runsOrError": {"__typename": "Runs", "results": []}}}])

        _orchestrator(transport).list_runs(policy_id="pol-1")

        tags = transport.last_variables["filter"]["tags"]
        assert {"key": "cuadra/policy_id", "value": "pol-1"} in tags

    def test_an_unfinished_run_has_no_duration_instead_of_a_fake_zero(self) -> None:
        transport = FakeTransport([
            {"data": {"runsOrError": {"__typename": "Runs", "results": [
                {"runId": "r-1", "jobName": "j", "status": "STARTED",
                 "startTime": 1000.0, "endTime": None, "tags": []},
            ]}}}
        ])

        runs = _orchestrator(transport).list_runs(policy_id="pol-1")

        assert runs[0].duration_seconds is None  # `—` en la UI, no `0`


class TestDegradation:
    """SDD §8: "Si Dagster no está disponible, la policy sigue existiendo pero la UI entra en estado
    degradado". El adapter nunca deja escapar un error de transporte crudo."""

    def test_a_transport_failure_becomes_a_typed_unavailable_error(self) -> None:
        transport = FakeTransport(raises=OSError("connection refused"))

        with pytest.raises(OrchestratorUnavailable):
            _orchestrator(transport).list_runs(policy_id="pol-1")

    def test_graphql_errors_arrive_with_http_200_and_must_not_pass_as_data(self) -> None:
        """GraphQL responde 200 CON un array `errors`. Un adapter que solo mira el status HTTP
        trataría un fallo como éxito y devolvería una lista vacía — la consola diría
        "no hay corridas" cuando en realidad no pudo preguntar."""
        transport = FakeTransport([{"errors": [{"message": "field 'runsOrError' not found"}]}])

        with pytest.raises(OrchestratorUnavailable, match="runsOrError"):
            _orchestrator(transport).list_runs(policy_id="pol-1")


def test_the_adapter_does_not_import_dagster() -> None:
    """GUARDA DE DESPLIEGUE. `dagster` vive en el grupo de deps `ingestion`, NO en las del proyecto:
    la imagen de la API no lo lleva. Si este adapter (que importa el controller admin) importara
    `dagster` o `dagster_graphql`, la API reventaría al arrancar en producción — un fallo que NO
    aparece en local, donde el grupo sí está instalado.
    """
    import ast
    import pathlib
    import sys

    from src.contexts.save.infrastructure.orchestrator import dagster_graphql

    # Sobre el AST y no sobre el texto: grepear "import dagster" da falso positivo con este mismo
    # docstring, que explica la regla. Lo que importa son los IMPORTS reales.
    tree = ast.parse(pathlib.Path(dagster_graphql.__file__).read_text(encoding="utf-8"))
    imported: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module)

    offenders = {m for m in imported if m == "dagster" or m.startswith("dagster")}
    assert not offenders, f"el adapter debe hablar GraphQL crudo, no usar el SDK: {offenders}"
    # y que no se haya colado transitivamente al importarlo:
    assert not any(m == "dagster" or m.startswith("dagster.") for m in sys.modules)


class TestSelectorResolution:
    """El selector de `launchRun` exige repositoryLocationName y repositoryName. Hardcodearlos en
    "" hace que el runner NO encuentre el job (medido contra un Dagster real: los valores vivos son
    `ingestion.definitions` / `__repository__`, y con "" el error es
    `Could not find Pipeline ..save_query_catalog`).

    Se RESUELVEN preguntándole al servidor, no adivinando: si el módulo de definiciones se renombra,
    hardcodear los rompería en silencio."""

    def _transport(self) -> FakeTransport:
        return FakeTransport([
            {"data": {"repositoriesOrError": {"__typename": "RepositoryConnection", "nodes": [
                {"name": "__repository__", "location": {"name": "ingestion.definitions"}}
            ]}}},
            {"data": {"launchRun": {"__typename": "LaunchRunSuccess", "run": {"runId": "r-1"}}}},
        ])

    def test_launch_uses_the_selector_reported_by_the_runner(self) -> None:
        transport = self._transport()

        _orchestrator(transport).launch(job_name="save_query_catalog", policy_id="pol-1")

        selector = transport.last_variables["selector"]
        assert selector["repositoryLocationName"] == "ingestion.definitions"
        assert selector["repositoryName"] == "__repository__"
        assert selector["jobName"] == "save_query_catalog"

    def test_the_selector_is_resolved_once_and_cached(self) -> None:
        # Resolverlo en cada launch sería un round-trip extra por acción del operador.
        transport = FakeTransport([
            {"data": {"repositoriesOrError": {"__typename": "RepositoryConnection", "nodes": [
                {"name": "__repository__", "location": {"name": "ingestion.definitions"}}
            ]}}},
            {"data": {"launchRun": {"__typename": "LaunchRunSuccess", "run": {"runId": "r-1"}}}},
            {"data": {"launchRun": {"__typename": "LaunchRunSuccess", "run": {"runId": "r-2"}}}},
        ])
        orch = _orchestrator(transport)

        orch.launch(job_name="save_query_catalog", policy_id="pol-1")
        orch.launch(job_name="save_coverage", policy_id="pol-1")

        queries = [c[1]["query"] for c in transport.calls]
        assert sum("repositoriesOrError" in q for q in queries) == 1

    def test_a_runner_without_repositories_degrades_instead_of_launching_blind(self) -> None:
        transport = FakeTransport([
            {"data": {"repositoriesOrError": {"__typename": "RepositoryConnection", "nodes": []}}}
        ])

        with pytest.raises(OrchestratorUnavailable):
            _orchestrator(transport).launch(job_name="save_query_catalog", policy_id="pol-1")
