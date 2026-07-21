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

    @property
    def trigger(self) -> str | None:
        """Quién la lanzó (`manual` / `automatic` / `retry`), del tag `cuadra/trigger` que ponemos
        en cada lanzamiento. `None` si la corrida no lo trae (p.ej. una lanzada fuera de la consola).
        Lo pide US-OR-D2 para decidir si reintentar tiene sentido."""
        return self.tags.get(TAG_TRIGGER)


# Tope de un texto de evento que la consola muestra. Existe por un caso MEDIDO, no por prudencia:
# un `message` real de una corrida fallida midió 21.386 caracteres — la excepción de SQLAlchemy trae
# el SQL con el VECTOR DE EMBEDDINGS entero embutido en los parámetros. Sin recorte, un solo evento
# hace scroll infinito y esconde los otros diecisiete.
MAX_EVENT_MESSAGE_CHARS = 240


class RunEventLevel(StrEnum):
    """Los cinco niveles del runner (`LogLevel`), verificados por introspección."""

    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class RunEventKind(StrEnum):
    """QUÉ es el evento, en el vocabulario de la consola.

    El runner declara 41 tipos de evento (`DagsterRunEvent` es una unión de 41 miembros). Reflejarlos
    uno a uno sería trasladarle al operador un vocabulario que es de Dagster, no suyo — y construir
    un visor de logs paralelo al que Dagster ya tiene y hace mejor. Acá se destila a lo que cambia
    una DECISIÓN: en qué fase va, qué produjo, y qué se rompió.
    """

    # Las fases de la corrida van SEPARADAS y no bajo un solo "ciclo de vida". Lo destapó el dato
    # real: el runner manda estos eventos con `message: ""` —el hecho ES el evento— así que la
    # palabra la tiene que poner la UI desde el `kind`. Colapsarlas dejaba cuatro filas idénticas y
    # sin texto: una línea de tiempo que no cuenta ninguna historia.
    QUEUED = "queued"                # encolada / desencolada / arrancando
    STARTED = "started"              # empezó a ejecutar
    SUCCEEDED = "succeeded"          # terminó bien
    CANCELED = "canceled"            # la cancelaron
    STEP = "step"                    # un paso empezó/terminó
    MATERIALIZATION = "materialization"  # el paso PRODUJO algo (lo que la corrida existe para hacer)
    LOG = "log"                      # un `context.log` de NUESTRO código de ingesta
    FAILURE = "failure"              # algo se rompió (paso o corrida)
    MACHINERY = "machinery"          # andamiaje del runner: procesos, workers, recursos, captura

    @property
    def is_run_phase(self) -> bool:
        """Si marca una fase de la CORRIDA (no de un paso). La UI las ancla distinto: son los hitos
        de la historia, y su texto lo pone ella porque el runner no manda ninguno."""
        return self in {
            RunEventKind.QUEUED,
            RunEventKind.STARTED,
            RunEventKind.SUCCEEDED,
            RunEventKind.CANCELED,
            RunEventKind.FAILURE,
        }


def _first_line(text: str) -> str:
    """Primera línea, recortada. La convención de Python pone el mensaje útil ahí y el contexto
    voluminoso (SQL, parámetros, stack) debajo — así que la primera línea ES el resumen, y recortarla
    no pierde nada que el operador fuera a leer de todos modos."""
    head = (text or "").strip().splitlines()
    if not head:
        return ""
    line = head[0].strip()
    return line if len(line) <= MAX_EVENT_MESSAGE_CHARS else line[: MAX_EVENT_MESSAGE_CHARS - 1] + "…"


@dataclass(frozen=True, slots=True)
class RunFailure:
    """Por qué se rompió una corrida.

    Guarda DOS niveles a propósito. El de arriba (`message`) es lo que Dagster envuelve, y por sí
    solo es inútil: `Error occurred while executing op "query_catalog_prices"` nombra el op que el
    operador ya está mirando y nada más. El de abajo (`root_*`) es la excepción que de verdad ocurrió
    —`psycopg.OperationalError: server closed the connection unexpectedly`— y es lo único que
    responde "¿qué hago ahora?".
    """

    class_name: str
    message: str
    root_class_name: str | None = None
    root_message: str | None = None

    @property
    def summary(self) -> str:
        """Una línea, la de la RAÍZ. Es lo que va en la card de "Última corrida" (US-OR-D2)."""
        return _first_line(self.root_message or self.message)

    @property
    def detail(self) -> str:
        """El texto de arriba, recortado. Para el desplegable "detalle técnico" — se ofrece, no se
        impone: el operador que sí sabe leerlo lo quiere, y al que no, estorbarle sería peor."""
        return _first_line(self.message)


@dataclass(frozen=True, slots=True)
class RunEvent:
    """Un evento de una corrida, ya traducido. `timestamp` puede faltar si el runner lo manda ilegible
    — igual que con las materializaciones, un tiempo que no se puede leer se omite en vez de
    inventarse."""

    timestamp: datetime | None
    level: RunEventLevel
    kind: RunEventKind
    message: str
    step_key: str | None = None
    failure: RunFailure | None = None

    @property
    def is_noise(self) -> bool:
        """Andamiaje que el operador no necesita ver.

        Medido contra una corrida exitosa REAL: 30 eventos, 24 en DEBUG — arranques de worker,
        inicialización de recursos, captura de logs. Son ciertos y son irrelevantes; mostrarlos
        entierra los 6 que importan.

        El filtro es por MAQUINARIA en DEBUG, no por nivel a secas: `RunStartEvent` también llega en
        DEBUG y es justo el que ancla la línea de tiempo. Y un fallo nunca es ruido, venga como venga
        — que es la misma lección que costó cara con `NEVER_MATERIALIZED`: el nivel de log describe
        al que ESCRIBE, no la importancia para el que LEE.
        """
        return self.kind is RunEventKind.MACHINERY and self.level is RunEventLevel.DEBUG

    @property
    def has_text(self) -> bool:
        """Si el evento trae texto propio. Los hitos de la corrida llegan VACÍOS del runner
        (verificado): la UI les pone la palabra desde `kind` en vez de pintar una fila muda."""
        return bool(self.message.strip())


@dataclass(frozen=True, slots=True)
class RunEventPage:
    """Una página de eventos. `next_cursor is None` = no hay más."""

    events: tuple[RunEvent, ...]
    next_cursor: str | None = None

    @property
    def failure(self) -> RunFailure | None:
        """El fallo de la corrida, para mostrarlo ARRIBA y no enterrado en la línea de tiempo.

        Se toma el ÚLTIMO: cuando un paso revienta llegan dos eventos con la misma causa
        (`ExecutionStepFailureEvent` y después `RunFailureEvent`), y el de la corrida es el que
        cierra la historia.
        """
        failures = [e.failure for e in self.events if e.failure is not None]
        return failures[-1] if failures else None


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
        cursor: str | None = None,
    ) -> Sequence[OrchestrationRun]:
        """Corridas de una policy, de la más nueva a la más vieja.

        `states` filtra DEL LADO DEL RUNNER. Existe para poder pedir "la última corrida EXITOSA"
        —lo que define el SLA— sin traerse el histórico entero para descartarlo acá: un flujo que
        falla seguido podría tener su último éxito a cientos de corridas de distancia.

        `cursor` = el id de la última corrida ya vista; devuelve las que vienen DESPUÉS. Se pagina por
        cursor y no por offset porque el log es append-only: un offset se corre solo cada vez que
        entra una corrida nueva, y el operador vería filas repetidas o saltadas al pasar de página.
        """
        ...

    def get_run(self, run_id: str) -> OrchestrationRun | None: ...

    def get_run_events(
        self,
        run_id: str,
        *,
        cursor: str | None = None,
        limit: int = 200,
    ) -> RunEventPage | None:
        """Eventos de UNA corrida, del más viejo al más nuevo (US-OR-D7).

        `None` cuando la corrida NO EXISTE — que no es lo mismo que no poder preguntar (eso último es
        `OrchestratorUnavailable`). Misma distinción que `get_asset`.

        El orden es cronológico ASCENDENTE y no descendente como el histórico de corridas: un log se
        lee como una historia, de principio a fin. El cursor avanza hacia ADELANTE (`afterCursor`),
        así que "cargar más" trae lo que siguió, no lo anterior.

        `limit` tiene un techo DURO del lado del runner: pedir más de 1000 hace que responda
        `Limit of N is too large. Max is 1000` — un error, no una lista recortada. El adapter lo
        acota; el puerto lo documenta para que nadie construya una UI que pida 2000.
        """
        ...

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
