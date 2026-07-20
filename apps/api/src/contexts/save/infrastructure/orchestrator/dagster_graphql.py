"""Adapter del `PipelineOrchestrator` contra Dagster, por GraphQL CRUDO.

**Por qué GraphQL a mano y no `dagster_graphql.DagsterGraphQLClient`** (que existe y tiene los
métodos que haríamos falta): `dagster` y `dagster-graphql` viven en el grupo de dependencias
`ingestion`, NO en las del proyecto — la imagen de la API deliberadamente no los lleva. Este módulo
lo importa el controller admin, así que importar el SDK reventaría la API al arrancar en
producción, con un fallo que NO se ve en local (donde el grupo está instalado). Hay un test que
falla si alguien mete `import dagster` acá.

**Las operaciones salieron de INTROSPECTAR el schema del paquete instalado (1.13.12)**, no de la
documentación: la doc pública afirma que el cliente no soporta cancelación y sí la soporta. Cuando
haya que tocar esto, introspectá de nuevo — no confíes en la doc ni en este comentario.

**Seguridad.** Dagster OSS NO tiene autenticación: cualquiera que alcance el webserver controla el
runner. Ergo: no se expone públicamente, la API lo alcanza por red privada, y la URL viene de
config (`SAVE_DAGSTER_GRAPHQL_URL`). NO se usa el `ssrf_guard` de `catalog_sources` a propósito —
ese guard existe porque allá la URL la escribe un ADMIN (input no confiable) y por eso fuerza HTTPS
y rechaza loopback/privadas; acá la URL es NUESTRA infraestructura interna, y aplicarlo rechazaría
justamente el caso legítimo (`http://localhost:3070` en dev, hosts privados en prod). Distinto
modelo de amenaza, distinto control.
"""
from __future__ import annotations

import json
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from typing import Any

import httpx

from ...domain.entities.orchestration_run import (
    RunState,
    run_state_from_runner,
    runner_statuses_for,
)
from ...domain.ports.orchestrator import (
    TAG_ACTOR,
    TAG_POLICY_ID,
    TAG_TRIGGER,
    OrchestrationRun,
    OrchestratorUnavailable,
    RunTrigger,
)

HttpPost = Callable[[str, dict, dict[str, str]], dict]

# Tag canónico de Dagster para fijar la partición de una corrida — `context.partition_key` se resuelve
# de acá. Valor INTROSPECCIONADO de `dagster._core.storage.tags.PARTITION_NAME_TAG` (dagster 1.13.x),
# NO importado: el adapter no puede importar `dagster` (vive fuera del grupo `ingestion`; importarlo
# reventaría la API al boot — gotcha #1, guardado por el test AST de conformidad).
_PARTITION_TAG = "dagster/partition"

_TIMEOUT_SECONDS = 10.0

_RUN_FIELDS = "runId jobName status startTime endTime tags { key value }"

_REPOSITORIES = """
query CuadraRepositories {
  repositoriesOrError {
    __typename
    ... on RepositoryConnection { nodes { name location { name } } }
    ... on PythonError { message }
  }
}
"""

_LAUNCH = """
mutation CuadraLaunch($selector: JobOrPipelineSelector!, $tags: [ExecutionTag!]) {
  launchRun(executionParams: {
    selector: $selector
    executionMetadata: { tags: $tags }
  }) {
    __typename
    ... on LaunchRunSuccess { run { runId } }
    ... on PythonError { message }
    ... on RunConfigValidationInvalid { message: pipelineName }
    ... on PipelineNotFoundError { message }
  }
}
"""

_REEXECUTE = """
mutation CuadraRetry($parentRunId: String!, $strategy: ReexecutionStrategy!) {
  launchRunReexecution(reexecutionParams: { parentRunId: $parentRunId, strategy: $strategy }) {
    __typename
    ... on LaunchRunSuccess { run { runId } }
    ... on PythonError { message }
  }
}
"""

_TERMINATE = """
mutation CuadraCancel($runId: String!) {
  terminateRun(runId: $runId) {
    __typename
    ... on PythonError { message }
    ... on TerminateRunFailure { message }
  }
}
"""

_RUNS = f"""
query CuadraRuns($filter: RunsFilter, $limit: Int) {{
  runsOrError(filter: $filter, limit: $limit) {{
    __typename
    ... on Runs {{ results {{ {_RUN_FIELDS} }} }}
    ... on PythonError {{ message }}
  }}
}}
"""

_RUN = f"""
query CuadraRun($runId: ID!) {{
  runOrError(runId: $runId) {{
    __typename
    ... on Run {{ {_RUN_FIELDS} }}
    ... on PythonError {{ message }}
  }}
}}
"""


def _default_post(url: str, payload: dict, headers: dict[str, str]) -> dict:
    with httpx.Client(timeout=_TIMEOUT_SECONDS) as client:
        response = client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()


def _epoch_to_dt(value: float | None) -> datetime | None:
    """Dagster expone los tiempos como epoch en SEGUNDOS (float). Siempre en UTC: el huso lo aplica
    la policy al mostrar, no el adapter al leer."""
    return datetime.fromtimestamp(value, tz=UTC) if value else None


class DagsterGraphQLOrchestrator:
    """Implementa `PipelineOrchestrator`. `http_post` es el seam de inyección para tests."""

    def __init__(self, url: str, http_post: HttpPost | None = None) -> None:
        self._url = url
        self._post = http_post or _default_post
        self._selector_base: dict[str, str] | None = None  # cache de la ubicación de código

    def _repository_selector(self) -> dict[str, str]:
        """Ubicación de código + repositorio, PREGUNTADOS al runner (no adivinados).

        `launchRun` exige `repositoryLocationName` y `repositoryName`. Medido contra un Dagster real
        (2026-07-19): valen `ingestion.definitions` y `__repository__`. Hardcodearlos parecía obvio
        y es una trampa doble: (1) con strings vacíos el runner NO encuentra el job y devuelve
        `Could not find Pipeline ..<job>` — un fallo que ningún test con transporte falso puede ver,
        porque el fake no valida el selector; (2) `ingestion.definitions` es el NOMBRE DEL MÓDULO:
        si el módulo se mueve o se renombra, un hardcode rompe el lanzamiento en silencio.

        Se resuelve una vez y se cachea: hacerlo en cada launch sería un round-trip extra por cada
        acción del operador.
        """
        if self._selector_base is None:
            data = self._execute(_REPOSITORIES, {})
            node = self._unwrap(
                data["repositoriesOrError"], "RepositoryConnection", "consulta de repositorios"
            )
            nodes = node.get("nodes") or []
            if not nodes:
                # Sin ubicación de código no hay nada que lanzar. Degradar es correcto: lanzar con
                # un selector inventado daría un error críptico del runner en vez de uno nuestro.
                raise OrchestratorUnavailable("el runner no reporta ninguna ubicación de código")
            first = nodes[0]
            self._selector_base = {
                "repositoryLocationName": first["location"]["name"],
                "repositoryName": first["name"],
            }
        return self._selector_base

    # ------------------------------------------------------------------ transporte + desempaque --

    def _execute(self, query: str, variables: dict[str, Any]) -> dict:
        if not self._url:
            raise OrchestratorUnavailable("SAVE_DAGSTER_GRAPHQL_URL no está configurada")
        try:
            body = self._post(
                self._url,
                {"query": query, "variables": variables},
                {"Content-Type": "application/json"},
            )
        except Exception as exc:  # httpx, DNS, timeout, JSON roto…
            # La aplicación no debe conocer httpx para saber que el runner no está.
            raise OrchestratorUnavailable(f"el runner no respondió: {exc}") from exc

        # GraphQL responde HTTP 200 CON un array `errors`. Un adapter que solo mire el status
        # trataría el fallo como éxito y devolvería vacío — la consola diría "no hay corridas"
        # cuando en realidad no pudo preguntar.
        if errors := body.get("errors"):
            raise OrchestratorUnavailable(f"el runner devolvió errores: {json.dumps(errors)}")
        data = body.get("data")
        if not isinstance(data, dict):
            raise OrchestratorUnavailable("respuesta del runner sin `data`")
        return data

    @staticmethod
    def _unwrap(node: dict, ok_typename: str, action: str) -> dict:
        """Las mutations/queries de Dagster devuelven UNIONES: el error viaja en `__typename` con
        HTTP 200. Leer el campo feliz a ciegas daría un KeyError críptico o —peor— un id vacío que
        la consola mostraría como una corrida real."""
        typename = node.get("__typename")
        if typename != ok_typename:
            detail = node.get("message") or typename or "sin detalle"
            raise OrchestratorUnavailable(f"{action} rechazado por el runner: {detail}")
        return node

    def _to_run(self, node: dict) -> OrchestrationRun:
        return OrchestrationRun(
            run_id=node["runId"],
            job_name=node.get("jobName") or "",
            state=run_state_from_runner(node.get("status") or ""),
            started_at=_epoch_to_dt(node.get("startTime")),
            ended_at=_epoch_to_dt(node.get("endTime")),
            tags={t["key"]: t["value"] for t in node.get("tags") or []},
        )

    # ------------------------------------------------------------------------------ operaciones --

    def launch(
        self,
        *,
        job_name: str,
        policy_id: str,
        trigger: RunTrigger = RunTrigger.MANUAL,
        actor_user_id: str | None = None,
        partition_key: str | None = None,
    ) -> str:
        # Los tags son la CORRELACIÓN policy↔corrida. `RunsFilter.tags` permite recuperarlas
        # después de forma exacta; sin esto habría que adivinar por nombre de job + timestamp.
        tags = [
            {"key": TAG_POLICY_ID, "value": policy_id},
            {"key": TAG_TRIGGER, "value": trigger.value},
        ]
        if actor_user_id:
            tags.append({"key": TAG_ACTOR, "value": actor_user_id})
        # Partición: Dagster resuelve `context.partition_key` de este tag. Sin él, un job particionado
        # (`save_query_catalog`) corre no-particionado y el asset revienta. `launchRun` ya manda los
        # tags por `executionMetadata.tags`, así que basta AGREGARLO — no cambia la forma del GraphQL.
        if partition_key:
            tags.append({"key": _PARTITION_TAG, "value": partition_key})

        selector = {**self._repository_selector(), "jobName": job_name}
        data = self._execute(_LAUNCH, {"selector": selector, "tags": tags})
        node = self._unwrap(data["launchRun"], "LaunchRunSuccess", "lanzamiento")
        return str(node["run"]["runId"])

    def retry(self, run_id: str) -> str:
        # FROM_FAILURE = la semántica oficial de retry (las otras son ALL_STEPS y
        # FROM_ASSET_FAILURE). Re-correr todo no sería un reintento: sería otra corrida, y para eso
        # ya está "Ejecutar ahora".
        data = self._execute(_REEXECUTE, {"parentRunId": run_id, "strategy": "FROM_FAILURE"})
        node = self._unwrap(data["launchRunReexecution"], "LaunchRunSuccess", "reintento")
        return str(node["run"]["runId"])

    def cancel(self, run_id: str) -> None:
        data = self._execute(_TERMINATE, {"runId": run_id})
        self._unwrap(data["terminateRun"], "TerminateRunSuccess", "cancelación")

    def list_runs(
        self,
        *,
        policy_id: str,
        limit: int = 20,
        states: Sequence[RunState] | None = None,
    ) -> Sequence[OrchestrationRun]:
        run_filter: dict[str, object] = {
            "tags": [{"key": TAG_POLICY_ID, "value": policy_id}]
        }
        if states:
            # Se filtra DEL LADO DEL RUNNER: traerse el histórico entero para descartarlo acá no
            # escala (un flujo que falla seguido puede tener su último éxito a cientos de corridas).
            # La traducción a los estados del runner sale del ÚNICO mapa que existe (dominio), no de
            # una lista repetida acá — dos mapas se desincronizan en cuanto alguien toca uno solo.
            run_filter["statuses"] = [
                runner for state in states for runner in runner_statuses_for(state)
            ]
        data = self._execute(_RUNS, {"filter": run_filter, "limit": limit})
        node = self._unwrap(data["runsOrError"], "Runs", "listado de corridas")
        return [self._to_run(r) for r in node.get("results") or []]

    def get_run(self, run_id: str) -> OrchestrationRun | None:
        data = self._execute(_RUN, {"runId": run_id})
        node = data["runOrError"]
        if node.get("__typename") == "RunNotFoundError":
            return None  # no es una degradación: la corrida simplemente no existe
        return self._to_run(self._unwrap(node, "Run", "consulta de corrida"))


__all__ = ["DagsterGraphQLOrchestrator", "RunState"]
