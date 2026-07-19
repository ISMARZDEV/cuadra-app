"""Port del ORQUESTADOR de pipelines — PURO (ADR 31).

Se llama `PipelineOrchestrator` y no `DagsterAdminPort` (como proponía el spec) a propósito: en este
contexto los ports se nombran por ROL, nunca por proveedor — `CatalogSource` (no `VtexPort`),
`EmbeddingProvider` (no `BgeM3Port`), `PushSender` (adapter: `expo_push_sender`), `CategoryJudgePort`
(adapter: `ClaudeJudge`). Meter "Dagster" en el dominio invertiría la dependencia que import-linter
enforcea y convertiría un cambio de runner en una reescritura en vez de un adapter nuevo.

El adapter concreto es `infrastructure/orchestrator/dagster_graphql.py`.
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Protocol

from ..entities.orchestration_run import RunState


class OrchestratorUnavailable(RuntimeError):
    """El runner no pudo responder (caído, inalcanzable, o respondió un error).

    Existe para que la consola pueda DEGRADAR en vez de romper: la política vive en NUESTRA DB, así
    que un runner caído no debe impedir ver ni editar la configuración — solo marca como
    `disconnected` las secciones que dependen de él (SDD §8).

    Es un tipo propio y no el error de transporte crudo: la aplicación no debe conocer httpx ni
    GraphQL para saber que el runner no está.
    """


class RunTrigger(StrEnum):
    MANUAL = "manual"      # el operador apretó "Ejecutar ahora"
    AUTOMATIC = "automatic"  # lo disparó la programación
    RETRY = "retry"        # re-ejecución de una corrida previa


# Namespace propio en los tags del runner. Prefijo `cuadra/` para no colisionar con los tags que
# Dagster se pone a sí mismo (`dagster/…`).
TAG_POLICY_ID = "cuadra/policy_id"
TAG_TRIGGER = "cuadra/trigger"
TAG_ACTOR = "cuadra/actor_user_id"


@dataclass(frozen=True, slots=True)
class OrchestrationRun:
    """Una corrida, en el vocabulario de la consola (no el del runner)."""

    run_id: str
    job_name: str
    state: RunState
    started_at: datetime | None = None
    ended_at: datetime | None = None
    tags: dict[str, str] = field(default_factory=dict)

    @property
    def duration_seconds(self) -> int | None:
        """`None` mientras no haya terminado. NUNCA 0: la UI muestra `—`, y un 0 se leería como
        "tardó nada" en vez de "todavía no sé"."""
        if self.started_at is None or self.ended_at is None:
            return None
        return int((self.ended_at - self.started_at).total_seconds())

    @property
    def policy_id(self) -> str | None:
        return self.tags.get(TAG_POLICY_ID)


class PipelineOrchestrator(Protocol):
    """Lo que la consola necesita del runner. Todo puede levantar `OrchestratorUnavailable`."""

    def launch(
        self,
        *,
        job_name: str,
        policy_id: str,
        trigger: RunTrigger = RunTrigger.MANUAL,
        actor_user_id: str | None = None,
        partition_key: str | None = None,
    ) -> str:
        """Lanza una corrida y devuelve su id. Se TAGUEA con `policy_id` para poder recuperarla
        después sin adivinar por nombre + ventana de tiempo.

        `partition_key` es OBLIGATORIO cuando el job está particionado (`save_query_catalog` particiona
        por provider_id): sin él la corrida es no-particionada y el asset revienta al leer
        `context.partition_key`. Quién decide si un flow lo necesita es `partition_key_for` (dominio)."""
        ...

    def retry(self, run_id: str) -> str:
        """Re-ejecuta desde el fallo (no desde cero) y devuelve el id de la corrida nueva."""
        ...

    def cancel(self, run_id: str) -> None: ...

    def list_runs(self, *, policy_id: str, limit: int = 20) -> Sequence[OrchestrationRun]: ...

    def get_run(self, run_id: str) -> OrchestrationRun | None: ...
