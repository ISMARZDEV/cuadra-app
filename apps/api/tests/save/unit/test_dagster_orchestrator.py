"""Unit — adapter GraphQL del runner (F4 #4.4). Sin red: se inyecta el transporte.

Todo lo que se afirma acá salió de INTROSPECTAR `dagster-graphql` 1.13.12 (el schema del paquete
instalado), no de la documentación — que ya se detectó desactualizada en esta misma integración.
"""
from __future__ import annotations

import pytest

from src.contexts.save.domain.entities.orchestration_run import RunState
from src.contexts.save.domain.ports.orchestrator import (
    AssetHealth,
    AssetPartitionKind,
    OrchestratorUnavailable,
    RunEventKind,
    RunTrigger,
)
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
    import subprocess
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

    # Y que no se cuele TRANSITIVAMENTE al importarlo. Esto se mide en un intérprete LIMPIO, no
    # sobre el `sys.modules` de la suite: ese es global del proceso, y `tests/ingestion` importa
    # dagster por definición. Preguntarle a él daba una guarda que pasaba SOLA y fallaba
    # ACOMPAÑADA — verde por aislamiento, roja por un motivo ajeno al adapter, y en ningún caso
    # midiendo la cadena de imports que dice defender.
    probe = subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys;"
            " import src.contexts.save.infrastructure.orchestrator.dagster_graphql;"
            " leaked = sorted(m for m in sys.modules"
            "                 if m == 'dagster' or m.startswith('dagster.'));"
            " print(','.join(leaked))",
        ],
        capture_output=True,
        text=True,
        cwd=pathlib.Path(__file__).resolve().parents[3],
    )
    assert probe.returncode == 0, f"el adapter no importa en un intérprete limpio: {probe.stderr}"
    leaked = probe.stdout.strip()
    assert not leaked, f"dagster entró transitivamente al importar el adapter: {leaked}"


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


# --------------------------------------------------------------------------------------- assets --
#
# §14 #9. Todo lo que se afirma acá salió de introspectar el schema instalado:
#   assetNodes           -> [AssetNode!]!            LISTA PELADA (sin unión: solo falla por `errors`)
#   assetNodeOrError     -> AssetNode | AssetNotFoundError    UNIÓN (dos caminos de error distintos)
#   partitionStats       -> numMaterialized numPartitions numFailed numMaterializing
#   MaterializationEvent.timestamp -> String! en MILISEGUNDOS  (¡no float en segundos como los runs!)


def _node(**over: object) -> dict:
    base: dict[str, object] = {
        "assetKey": {"path": ["query_catalog_prices"]},
        "groupName": "default",
        "description": "Descubrimiento por-query",
        "jobNames": ["save_query_catalog"],
        "dependencyKeys": [],
        "dependedByKeys": [],
        "isPartitioned": False,
        "partitionDefinition": None,
        "partitionStats": None,
        "assetMaterializations": [],
    }
    base.update(over)
    return base


class TestListAssets:
    def test_joins_the_asset_key_path_because_it_is_a_LIST_of_segments(self) -> None:
        """`AssetKey` no es un string: es `{path: [...]}`. Leerlo como string daría `None` silencioso
        y la tabla saldría con la clave vacía en cada fila."""
        transport = FakeTransport([
            {"data": {"assetNodes": [_node(assetKey={"path": ["save", "prices"]})]}}
        ])

        assets = _orchestrator(transport).list_assets()

        assert assets[0].key == "save/prices"

    def test_a_non_partitioned_asset_carries_NO_partition_stats(self) -> None:
        """Aunque el runner mandara un `partitionStats`, si el asset no está particionado no hay
        cobertura que mostrar. `None` != `0 de 0`."""
        transport = FakeTransport([{"data": {"assetNodes": [
            _node(isPartitioned=False, partitionStats={
                "numPartitions": 0, "numMaterialized": 0, "numFailed": 0, "numMaterializing": 0,
            })
        ]}}])

        assert _orchestrator(transport).list_assets()[0].partitions is None

    def test_a_partitioned_asset_keeps_the_AGGREGATE_that_the_runner_already_computed(self) -> None:
        """US-OR-L4 pide `rest_catalog_prices` como UNA fila con su estado agregado, no una fila por
        sección. Dagster ya lo agrega — no se recalcula acá."""
        transport = FakeTransport([{"data": {"assetNodes": [
            _node(assetKey={"path": ["rest_catalog_prices"]}, isPartitioned=True, partitionStats={
                "numPartitions": 12, "numMaterialized": 9, "numFailed": 2, "numMaterializing": 1,
            })
        ]}}])

        stats = _orchestrator(transport).list_assets()[0].partitions

        assert stats is not None
        assert (stats.total, stats.materialized, stats.failed, stats.materializing) == (12, 9, 2, 1)

    def test_materialization_timestamp_is_a_STRING_in_MILLISECONDS(self) -> None:
        """El bug que este test existe para impedir: `Run.startTime` es float en SEGUNDOS, pero
        `MaterializationEvent.timestamp` es String en MILISEGUNDOS. Tratarlos igual da una fecha del
        año ~57000 — plausible a la vista de un parser y absurda para el operador."""
        transport = FakeTransport([{"data": {"assetNodes": [
            _node(assetMaterializations=[{"runId": "run-9", "timestamp": "1752969600000"}])
        ]}}])

        asset = _orchestrator(transport).list_assets()[0]

        assert asset.last_materialized_at is not None
        assert asset.last_materialized_at.year == 2025
        assert asset.last_run_id == "run-9"

    def test_no_materialization_means_never_ran_not_broken(self) -> None:
        transport = FakeTransport([{"data": {"assetNodes": [_node(assetMaterializations=[])]}}])

        asset = _orchestrator(transport).list_assets()[0]

        assert asset.last_materialized_at is None
        assert asset.health is AssetHealth.NEVER_MATERIALIZED

    def test_an_unreadable_timestamp_degrades_instead_of_taking_the_console_down(self) -> None:
        transport = FakeTransport([{"data": {"assetNodes": [
            _node(assetMaterializations=[{"runId": "r", "timestamp": "no-soy-un-numero"}])
        ]}}])

        assert _orchestrator(transport).list_assets()[0].last_materialized_at is None

    def test_lineage_travels_with_the_node_so_ONE_call_returns_the_whole_graph(self) -> None:
        """Por esto el puerto NO tiene `get_lineage()`: sería un round-trip extra para datos que la
        primera llamada ya trajo."""
        transport = FakeTransport([{"data": {"assetNodes": [_node(
            dependencyKeys=[{"path": ["embed_canonicals"]}],
            dependedByKeys=[{"path": ["price_drops"]}, {"path": ["alert_matching"]}],
        )]}}])

        asset = _orchestrator(transport).list_assets()[0]

        assert asset.dependency_keys == ("embed_canonicals",)
        assert asset.depended_by_keys == ("price_drops", "alert_matching")

    def test_hides_dagsters_implicit_job_from_the_operator(self) -> None:
        """`__ASSET_JOB` es el job IMPLÍCITO que Dagster se crea solo: no se puede lanzar ni
        reintentar desde la consola, así que mostrarlo es ruido con forma de acción. Lo destapó el
        dato REAL — todos los assets lo traían y ningún test con fixture propio podía verlo."""
        transport = FakeTransport([{"data": {"assetNodes": [
            _node(jobNames=["__ASSET_JOB", "save_query_catalog"])
        ]}}])

        assert _orchestrator(transport).list_assets()[0].job_names == ("save_query_catalog",)

    def test_an_asset_with_ONLY_the_implicit_job_reports_no_jobs(self) -> None:
        """Y entonces la fila muestra `—`: honesto. Inventarle un nombre de job sería peor."""
        transport = FakeTransport([{"data": {"assetNodes": [_node(jobNames=["__ASSET_JOB"])]}}])

        assert _orchestrator(transport).list_assets()[0].job_names == ()

    def test_translates_the_runner_partition_name_into_domain_vocabulary(self) -> None:
        """Nombres VERIFICADOS contra el Dagster real: `query_catalog_provider` (una parte por
        supermercado) y `rest_catalog_section` (una por sección). Sin esto, `2/41` es un número sin
        sujeto y el operador no puede interpretarlo."""
        transport = FakeTransport([{"data": {"assetNodes": [
            _node(isPartitioned=True, partitionDefinition={"name": "query_catalog_provider"},
                  partitionStats={"numPartitions": 4, "numMaterialized": 3, "numFailed": 0,
                                  "numMaterializing": 0}),
        ]}}])

        stats = _orchestrator(transport).list_assets()[0].partitions

        assert stats is not None and stats.kind is AssetPartitionKind.PROVIDER

    def test_an_unmapped_partition_name_degrades_to_generic_instead_of_guessing(self) -> None:
        transport = FakeTransport([{"data": {"assetNodes": [
            _node(isPartitioned=True, partitionDefinition={"name": "algo_nuevo"},
                  partitionStats={"numPartitions": 2, "numMaterialized": 1, "numFailed": 0,
                                  "numMaterializing": 0}),
        ]}}])

        stats = _orchestrator(transport).list_assets()[0].partitions

        assert stats is not None and stats.kind is AssetPartitionKind.OTHER

    def test_no_code_location_is_NOT_a_pipeline_without_assets(self) -> None:
        """Incidente real (2026-07-20): el code-server perdió su conexión a Postgres y quedó en
        error. El webserver seguía vivo y `assetNodes` devolvía `[]`, así que la consola anunció "el
        orquestador respondió, pero no declara ningún asset" — cierto de forma literal y engañoso de
        forma operativa: no había pipeline vacío, había una ubicación de código caída.

        Se distingue preguntando por las ubicaciones, que es lo mismo que ya hacía `launch` para no
        lanzar contra un selector vacío."""
        transport = FakeTransport([
            {"data": {"assetNodes": []}},
            {"data": {"repositoriesOrError": {"__typename": "RepositoryConnection", "nodes": []}}},
        ])

        with pytest.raises(OrchestratorUnavailable, match="ubicación de código"):
            _orchestrator(transport).list_assets()

    def test_an_empty_pipeline_with_a_healthy_location_is_reported_as_empty(self) -> None:
        """Y al revés: con la ubicación cargada, una lista vacía es una respuesta legítima."""
        transport = FakeTransport([
            {"data": {"assetNodes": []}},
            {"data": {"repositoriesOrError": {"__typename": "RepositoryConnection", "nodes": [
                {"name": "__repository__", "location": {"name": "ingestion.definitions"}}]}}},
        ])

        assert _orchestrator(transport).list_assets() == []

    def test_an_errors_array_is_NOT_an_empty_pipeline(self) -> None:
        """`assetNodes` es lista pelada: su único camino de error es `errors`. Devolver `[]` acá haría
        que la tab dijera "el pipeline no tiene assets" cuando no se pudo preguntar."""
        transport = FakeTransport([{"errors": [{"message": "boom"}]}])

        with pytest.raises(OrchestratorUnavailable):
            _orchestrator(transport).list_assets()


class TestGetAsset:
    def test_asset_not_found_is_an_ANSWER_not_an_outage(self) -> None:
        """`AssetNotFoundError` es la unión respondiendo "no existe". Tratarlo como caída haría que
        la consola dijera "el orquestador no responde" con el orquestador contestando — el error
        exacto que F4 ya cometió una vez."""
        transport = FakeTransport([
            {"data": {"assetNodeOrError": {"__typename": "AssetNotFoundError", "message": "nope"}}}
        ])

        assert _orchestrator(transport).get_asset("no_existe") is None

    def test_splits_the_key_back_into_the_path_the_schema_expects(self) -> None:
        transport = FakeTransport([
            {"data": {"assetNodeOrError": dict(_node(assetKey={"path": ["save", "prices"]}),
                                               __typename="AssetNode")}}
        ])

        asset = _orchestrator(transport).get_asset("save/prices")

        assert transport.last_variables["assetKey"] == {"path": ["save", "prices"]}
        assert asset is not None and asset.key == "save/prices"

    def test_a_python_error_in_the_union_is_still_an_outage(self) -> None:
        transport = FakeTransport([
            {"data": {"assetNodeOrError": {"__typename": "PythonError", "message": "boom"}}}
        ])

        with pytest.raises(OrchestratorUnavailable):
            _orchestrator(transport).get_asset("query_catalog_prices")


class TestGetRunEvents:
    """US-OR-D7. Los fixtures de acá son RECORTES LITERALES de un Dagster real (2026-07-20),
    incluida la corrida fallida `55017ded` — no formas inventadas."""

    @staticmethod
    def _connection(events: list[dict], cursor: str = "cur-1", has_more: bool = False) -> dict:
        return {"data": {"logsForRun": {
            "__typename": "EventConnection",
            "cursor": cursor,
            "hasMore": has_more,
            "events": events,
        }}}

    def test_timestamps_are_MILLISECONDS_here_unlike_run_start_times(self) -> None:
        """`MessageEvent.timestamp` es un **String** en **MILISEGUNDOS**, mientras que
        `Run.startTime` es un **float** en **SEGUNDOS**. Dos unidades y dos tipos en el mismo schema.
        Tratarlos igual da fechas del año 58.500 — plausibles a la vista y falsas."""
        transport = FakeTransport([self._connection([
            {"__typename": "RunStartEvent", "message": "", "timestamp": "1784588507883",
             "level": "INFO", "stepKey": None, "eventType": "RUN_START"},
        ])])

        page = _orchestrator(transport).get_run_events("r-1")

        assert page is not None
        assert page.events[0].timestamp is not None
        assert page.events[0].timestamp.year == 2026

    def test_the_root_cause_is_the_LAST_link_of_the_error_chain(self) -> None:
        """Recorte literal de la corrida fallida real: Dagster envuelve la excepción en un error
        propio que no dice nada. `errorChain` va de AFUERA hacia ADENTRO → la raíz es la última."""
        transport = FakeTransport([self._connection([
            {"__typename": "RunFailureEvent", "message": "", "timestamp": "1784527320000",
             "level": "ERROR", "stepKey": None, "eventType": "RUN_FAILURE",
             "error": {
                 "message": 'dagster._core.errors.DagsterExecutionStepExecutionError: Error '
                            'occurred while executing op "query_catalog_prices":\n',
                 "className": "DagsterExecutionStepExecutionError",
                 "errorChain": [
                     {"isExplicitLink": True, "error": {
                         "className": "OperationalError",
                         "message": "sqlalchemy.exc.OperationalError: (psycopg.OperationalError) "
                                    "consuming input failed\n[SQL: SELECT ...]\n"}},
                     {"isExplicitLink": True, "error": {
                         "className": "OperationalError",
                         "message": "psycopg.OperationalError: consuming input failed: server "
                                    "closed the connection unexpectedly\n"}},
                 ],
             }},
        ])])

        page = _orchestrator(transport).get_run_events("r-1")

        assert page is not None and page.failure is not None
        assert page.failure.root_class_name == "OperationalError"
        assert "server closed the connection unexpectedly" in page.failure.summary

    def test_dagster_event_types_are_translated_to_the_console_vocabulary(self) -> None:
        """41 tipos de evento del runner → 6 palabras nuestras. `LogMessageEvent` llega con
        `eventType: null` en el dato real, así que el mapeo va por `__typename`, no por `eventType`."""
        transport = FakeTransport([self._connection([
            {"__typename": "RunStartEvent", "message": "", "timestamp": "1784588507000",
             "level": "INFO", "stepKey": None, "eventType": "RUN_START"},
            {"__typename": "LogMessageEvent", "message": "Sirena: 5/5 búsquedas",
             "timestamp": "1784588508000", "level": "INFO", "stepKey": "query_catalog_prices",
             "eventType": None},
            {"__typename": "MaterializationEvent", "message": "", "timestamp": "1784588509000",
             "level": "DEBUG", "stepKey": "query_catalog_prices",
             "eventType": "ASSET_MATERIALIZATION"},
            {"__typename": "StepWorkerStartedEvent", "message": "", "timestamp": "1784588510000",
             "level": "DEBUG", "stepKey": "x", "eventType": "STEP_WORKER_STARTED"},
        ])])

        kinds = [e.kind for e in (_orchestrator(transport).get_run_events("r-1") or []).events]

        assert kinds == [
            RunEventKind.STARTED,
            RunEventKind.LOG,
            RunEventKind.MATERIALIZATION,
            RunEventKind.MACHINERY,
        ]

    def test_an_unknown_event_type_degrades_to_machinery_instead_of_crashing(self) -> None:
        """Dagster va a agregar tipos. Un `KeyError` en la consola por un evento nuevo sería
        cambiar "no sé qué es esto" por "la consola está rota"."""
        transport = FakeTransport([self._connection([
            {"__typename": "AlgoQueTodaviaNoExisteEvent", "message": "?",
             "timestamp": "1784588507000", "level": "DEBUG", "stepKey": None, "eventType": "?"},
        ])])

        page = _orchestrator(transport).get_run_events("r-1")

        assert page is not None and page.events[0].kind is RunEventKind.MACHINERY

    def test_the_limit_is_clamped_to_the_runners_hard_ceiling(self) -> None:
        """Medido: pedir 2000 devuelve `Limit of 2000 is too large. Max is 1000` — un ERROR, no una
        lista recortada. Un techo que se descubre en producción no es un techo, es una caída."""
        transport = FakeTransport([self._connection([])])

        _orchestrator(transport).get_run_events("r-1", limit=5000)

        assert transport.last_variables["limit"] == 1000

    def test_next_cursor_is_None_when_the_runner_says_there_is_no_more(self) -> None:
        """El cursor lo dicta `hasMore`, NO la cantidad de filas: el runner filtra del lado suyo, así
        que una página corta puede perfectamente tener continuación."""
        transport = FakeTransport([self._connection([], cursor="c-9", has_more=False)])

        page = _orchestrator(transport).get_run_events("r-1")

        assert page is not None and page.next_cursor is None

    def test_next_cursor_is_forwarded_when_there_IS_more(self) -> None:
        transport = FakeTransport([self._connection([], cursor="c-9", has_more=True)])

        page = _orchestrator(transport).get_run_events("r-1")

        assert page is not None and page.next_cursor == "c-9"

    def test_the_cursor_travels_as_afterCursor_because_a_log_is_read_forward(self) -> None:
        transport = FakeTransport([self._connection([])])

        _orchestrator(transport).get_run_events("r-1", cursor="c-3")

        assert transport.last_variables["afterCursor"] == "c-3"

    def test_a_missing_run_is_an_ANSWER_not_an_outage(self) -> None:
        transport = FakeTransport([
            {"data": {"logsForRun": {"__typename": "RunNotFoundError", "message": "nope"}}}
        ])

        assert _orchestrator(transport).get_run_events("no-existe") is None

    def test_a_python_error_in_the_union_is_still_an_outage(self) -> None:
        transport = FakeTransport([
            {"data": {"logsForRun": {"__typename": "PythonError", "message": "boom"}}}
        ])

        with pytest.raises(OrchestratorUnavailable):
            _orchestrator(transport).get_run_events("r-1")
