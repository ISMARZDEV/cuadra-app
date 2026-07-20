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


class AssetHealth(StrEnum):
    """Salud OPERATIVA de un asset — derivada, nunca almacenada.

    `NEVER_MATERIALIZED` es un estado propio y no un `FAILED`: es la misma distinción que costó cara
    en F4 con el runner ("un flujo que nunca corrió ≠ runner muerto"). Fusionarlos haría que un
    deploy nuevo mostrara el pipeline entero en rojo estando perfectamente sano.
    """

    NEVER_MATERIALIZED = "never_materialized"
    HEALTHY = "healthy"
    DEGRADED = "degraded"  # algunas particiones fallaron; el asset sigue sirviendo
    FAILED = "failed"      # TODAS fallaron


class AssetPartitionKind(StrEnum):
    """De QUÉ son las partes. Sin esto, `2/41` es un número sin sujeto — el operador no sabe si son
    supermercados, secciones o cualquier otra cosa, y un número que no se puede interpretar no
    sirve para decidir nada.

    `OTHER` es la salida honesta: una partición nueva que nadie mapeó dice "partes", que es cierto
    aunque sea vago. Inventarle un nombre sería peor que ser genérico.
    """

    PROVIDER = "provider"  # una parte por supermercado
    SECTION = "section"    # una parte por sección del catálogo
    OTHER = "other"


@dataclass(frozen=True, slots=True)
class AssetPartitionStats:
    """Estado AGREGADO de las particiones, tal como lo da el runner (`PartitionStats`).

    US-OR-L4 lo pide explícitamente así para `rest_catalog_prices`: una fila por asset con su estado
    agregado, NO una fila por sección. No hace falta agregarlo a mano — Dagster ya lo calcula.
    """

    total: int
    materialized: int
    failed: int
    materializing: int
    kind: AssetPartitionKind = AssetPartitionKind.OTHER

    @property
    def coverage_ratio(self) -> float | None:
        """`None` cuando no hay particiones que cubrir. Devolver `0.0` sería afirmar "0% cubierto"
        de algo que no tiene cobertura definida — un cero es una AFIRMACIÓN."""
        if self.total <= 0:
            return None
        return self.materialized / self.total


@dataclass(frozen=True, slots=True)
class PipelineAsset:
    """Un asset del pipeline, en el vocabulario de la consola (no el del runner).

    `partitions is None` significa NO PARTICIONADO — distinto de "particionado con 0 particiones".
    """

    key: str
    group: str
    description: str | None
    job_names: tuple[str, ...]
    # El lineage viaja CON el nodo porque en el schema real es un CAMPO (`dependencyKeys` /
    # `dependedByKeys`), no una query. Por eso el puerto no tiene `get_lineage()`: sería un segundo
    # round-trip para recomponer lo que `list_assets()` ya trajo — devuelve el grafo COMPLETO.
    dependency_keys: tuple[str, ...]
    depended_by_keys: tuple[str, ...]
    partitions: AssetPartitionStats | None
    last_materialized_at: datetime | None
    last_run_id: str | None

    @property
    def health(self) -> AssetHealth:
        if self.last_materialized_at is None:
            return AssetHealth.NEVER_MATERIALIZED
        p = self.partitions
        if p is None or p.failed == 0:
            return AssetHealth.HEALTHY
        # Todas fallaron → FAILED. Algunas → DEGRADED: que una sección del browse de Bravo falle no
        # significa que el browse esté caído, y mandar al operador a arreglar algo que mayormente
        # funciona es ruido con forma de alarma.
        return AssetHealth.FAILED if p.materialized == 0 else AssetHealth.DEGRADED


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

    def list_runs(
        self,
        *,
        policy_id: str,
        limit: int = 20,
        states: Sequence[RunState] | None = None,
    ) -> Sequence[OrchestrationRun]:
        """Corridas de una policy, de la más nueva a la más vieja.

        `states` filtra DEL LADO DEL RUNNER. Existe para poder pedir "la última corrida EXITOSA"
        —lo que define el SLA— sin traerse el histórico entero para descartarlo acá: un flujo que
        falla seguido podría tener su último éxito a cientos de corridas de distancia.
        """
        ...

    def get_run(self, run_id: str) -> OrchestrationRun | None: ...

    def list_assets(self) -> Sequence[PipelineAsset]:
        """TODOS los assets del pipeline, con su lineage incluido.

        Es UNA sola llamada al runner y devuelve el grafo completo: por eso no hay `get_lineage()`.
        El SDD proponía tres métodos (`list_assets`/`get_asset`/`get_lineage`); la introspección del
        schema instalado mostró que el lineage son CAMPOS del nodo, así que el tercero sería un
        round-trip extra para datos que ya tenemos.
        """
        ...

    def get_asset(self, key: str) -> PipelineAsset | None:
        """`None` cuando el runner responde que ese asset NO EXISTE (`AssetNotFoundError`), que es
        distinto de no poder preguntar — eso último es `OrchestratorUnavailable`."""
        ...
