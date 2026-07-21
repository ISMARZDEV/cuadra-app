"""Consola de Orquestación de Save (F4) — rutas admin.

Router APARTE de `admin_save` y con capability PROPIA (`ADMIN_SAVE_ORCHESTRATION_OPS`): lanzar,
cancelar y reprogramar corridas es más sensible que editar un provider. Y pesa más de lo que
parece — **Dagster OSS no tiene autenticación**, así que esta capability es el ÚNICO control de
acceso real sobre la ejecución del pipeline.

Controllers finos (ADR 31): parsean, delegan en el use-case y auditan en el borde (T2). Toda
mutación escribe su fila de auditoría en la MISMA transacción del request.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from src.api.composition_root import (
    get_create_provider_flow,
    get_provider_repo,
    get_orchestration_config_repo,
    get_orchestration_policy_repo,
    get_pipeline_orchestrator,
    get_run_snapshot_repo,
)
from src.api.extensions.security import get_current_user_id, require_capability
from src.contexts.identity.domain.enums import CapabilityKey
from src.contexts.save.application.admin_audit_recorder import AdminAuditRecorder
from src.contexts.save.application.orchestration_policies import (
    CreateProviderFlow,
    ProviderFlowNotSupported,
    RunPolicyNow,
    soft_delete,
)
from src.contexts.save.domain.entities.orchestration import (
    ExecutionMode,
    FlowKey,
    OrchestrationPolicy,
    SlaStatus,
)
from src.contexts.save.domain.entities.orchestration_run import RunState
from src.contexts.save.domain.ports.orchestrator import (
    OrchestratorUnavailable,
    PipelineAsset,
    PipelineOrchestrator,
)

from .admin_save import get_admin_audit

orchestration_router = APIRouter(
    prefix="/admin/save/orchestration",
    tags=["admin-save-orchestration"],
    dependencies=[Depends(require_capability(CapabilityKey.ADMIN_SAVE_ORCHESTRATION_OPS))],
)

MARKET = "DO"  # single-market, igual que el resto del admin


# ----------------------------------------------------------------------------------------- DTOs --

class PolicyDto(BaseModel):
    policy_id: str
    provider_id: str | None
    market_id: str
    flow_key: str | None
    execution_mode: str
    cron_expression: str | None
    timezone: str
    sla_minutes: int | None
    query_limit_override: int | None
    enabled: bool
    # Se EXPONE aunque hoy ninguna lógica lo lea (solo se persiste), porque `UpdatePolicyRequest` lo
    # acepta: un campo escribible que no se puede leer es una trampa — un form no puede conocer su
    # valor actual, nace vacío y cada guardado lo pisa en silencio. Fue un bug real (2026-07-20).
    # La simetría la vigila `tests/save/unit/test_admin_dto_symmetry.py`.
    priority: int | None
    # `None` no es "nunca": es "el reloj no dispara este flow" (modo manual o cadena declarativa).
    next_run_at: str | None


class RunMetricsDto(BaseModel):
    seen: int
    refreshed: int
    matched: int
    auto_linked: int
    queued_for_review: int
    discarded: int
    # Derivado por atribución, no almacenado: sigue creciendo mientras el operador resuelve la cola.
    new_canonicals: int
    # §14 #14 — progreso REAL por búsquedas. `seen` cuenta productos DEVUELTOS, así que nunca pudo
    # responder "¿por dónde va?". `query_progress` es `None` cuando no hay plan contra el que medir:
    # un 0.0 afirmaría "0% hecho" de algo sin progreso definido.
    queries_total: int = 0
    queries_processed: int = 0
    query_progress: float | None = None


class ProviderFlowDto(BaseModel):
    # Identidad VISIBLE del flujo. Sin el nombre, la tabla muestra tres filas idénticas que dicen
    # `provider_prices_refresh` y el operador no sabe cuál es cuál — detectado mirando el render
    # real, no por los tests.
    provider_name: str | None
    provider_logo_url: str | None
    policy: PolicyDto
    last_run_metrics: RunMetricsDto | None
    # Estado de la última corrida SEGÚN EL RUNNER (queued|running|canceling|succeeded|failed|
    # canceled|unknown). `None` = el runner no respondió o no hay corridas: la UI muestra
    # `desconectado`/`sin corridas`, nunca un estado inventado.
    last_run_state: str | None = None
    last_run_id: str | None = None
    # CUÁNDO fue la última corrida, sea cual sea su desenlace. Distinto de `last_success_at`, que
    # solo mira las EXITOSAS: el operador necesita las dos: "cuándo se intentó" y "cuándo funcionó".
    # `ended_at` si terminó; `started_at` si sigue en vuelo (aún no hay final que mostrar).
    last_run_at: str | None = None
    # Desenlace del SLA: `within` | `breached` | `not_applicable`. Lo calcula el DOMINIO
    # (`OrchestrationPolicy.sla_status`), no el front — el KPI de la consola y el detalle por
    # proveedor tienen que responder lo MISMO, y una regla duplicada en dos pantallas se
    # desincroniza en silencio. `not_applicable` = flujo manual o sin SLA configurado: queda FUERA
    # del denominador del KPI, nunca contado como incumplido.
    sla_status: str = SlaStatus.NOT_APPLICABLE.value
    # Última corrida EXITOSA. `None` = nunca tuvo una (que NO es lo mismo que "el runner no respondió").
    last_success_at: str | None = None


class ProviderFlowListDto(BaseModel):
    """Envelope con la salud del RUNNER declarada explícitamente.

    Antes esto era una lista pelada y el front infería "runner caído" de que ninguna fila trajera
    métricas. Es una inferencia FALSA: un flujo que nunca corrió se ve idéntico a un runner muerto,
    así que la consola anunciaba "el orquestador no responde" con el orquestador perfectamente vivo.
    Quien sabe si el runner respondió es el backend — que lo diga, en vez de que el front adivine.
    """

    runner_available: bool
    flows: list[ProviderFlowDto]


class CreateProviderFlowRequest(BaseModel):
    provider_id: str
    flow_key: FlowKey = FlowKey.PROVIDER_PRICES_REFRESH
    timezone: str = "America/Santo_Domingo"


class UpdatePolicyRequest(BaseModel):
    execution_mode: ExecutionMode | None = None
    cron_expression: str | None = None
    timezone: str | None = None
    sla_minutes: int | None = None
    query_limit_override: int | None = Field(default=None, ge=0)
    priority: int | None = None


class RunLaunchedDto(BaseModel):
    run_id: str


class RunFailureDto(BaseModel):
    """Por qué se rompió una corrida (US-OR-D2 + D7).

    `summary` es la RAÍZ en una línea — lo único que responde "¿qué hago ahora?". `detail` es el
    envoltorio de Dagster, que por sí solo no dice nada (`Error occurred while executing op "X"`
    nombra el op que el operador ya está mirando) pero que el que sabe leerlo quiere ver.
    """

    summary: str
    detail: str
    root_class_name: str | None = None


class RunSummaryDto(BaseModel):
    """Una corrida en el vocabulario del detalle. En la LISTA esto vive aplanado
    (`last_run_state` + `last_run_id`); acá se extrae como tipo propio porque el detalle muestra
    VARIAS corridas (actual, última exitosa, histórico) y aplanar tres se vuelve ilegible."""

    run_id: str
    state: str
    # Quién la lanzó (`manual`/`automatic`/`retry`). US-OR-D2: el operador decide si reintentar según
    # cómo se disparó. `None` si la corrida no trae el tag.
    trigger: str | None = None
    started_at: str | None = None
    ended_at: str | None = None
    duration_seconds: int | None = None
    # Solo cuando falló, y solo en el detalle: la causa se pide al runner únicamente si hubo fallo
    # (US-OR-D2). `None` también cuando el runner se cayó justo al preguntarla — un extra que no
    # llegó no debe hundir la página.
    failure: RunFailureDto | None = None


class RunHistoryDto(BaseModel):
    """Una página del histórico de corridas (US-OR-D6). `next_cursor is None` = no hay más."""

    runs: list[RunSummaryDto]
    next_cursor: str | None = None


class RunEventDto(BaseModel):
    """Un evento de una corrida (US-OR-D7), ya traducido al vocabulario de la consola."""

    timestamp: str | None
    level: str
    # `queued` | `started` | `succeeded` | `canceled` | `step` | `materialization` | `log` |
    # `failure` | `machinery`. Los hitos de la corrida llegan del runner SIN texto, así que el front
    # los nombra desde acá — por eso el kind es granular y no un solo "lifecycle".
    kind: str
    message: str
    step_key: str | None = None
    # DECLARADO, no descartado en el servidor: la página es chica (18-30 eventos medidos), así que
    # mandarla entera deja el "ver todo" instantáneo en vez de costar otro viaje al runner.
    is_noise: bool = False
    # `False` = el runner no mandó texto y la palabra la pone la UI desde `kind`.
    has_text: bool = True
    failure: RunFailureDto | None = None


class RunEventPageDto(BaseModel):
    """Una página de eventos. `next_cursor is None` = no hay más.

    `failure` se repite ARRIBA a propósito aunque también viaje en su evento: es lo primero que el
    operador tiene que leer, y obligarlo a encontrarlo dentro de la línea de tiempo sería esconder
    la única respuesta a "¿qué pasó?".
    """

    events: list[RunEventDto]
    next_cursor: str | None = None
    failure: RunFailureDto | None = None


class ProviderOrchestrationDetailDto(BaseModel):
    """Detalle operativo de UN provider-flow (#11).

    Reusa `PolicyDto` y `RunMetricsDto` en vez de duplicarlos: el SDD lo pide explícitamente, y dos
    proyecciones del mismo dato se desincronizan en cuanto alguien toca una.

    NO trae `health_status` ni `event_snippets` a propósito. El primero es la salud de la FUENTE
    (frescura del precio), que vive en Sources y mezclarla acá haría que un proveedor apareciera
    fuera de SLA porque la tienda dejó de devolver un producto — algo que la orquestación no
    controla. El segundo está bloqueado por `get_run_events()` en el puerto (§14 #15).
    """

    provider_id: str
    provider_name: str | None
    provider_logo_url: str | None
    market_id: str
    flow_key: str
    policy: PolicyDto
    # DECLARADO por el backend, no inferido: un flujo que nunca corrió se ve idéntico a un runner
    # muerto, y esa inferencia ya se hizo mal una vez.
    runner_available: bool
    current_run: RunSummaryDto | None = None
    last_successful_run: RunSummaryDto | None = None
    sla_status: str = SlaStatus.NOT_APPLICABLE.value
    # Del último éxito, NUNCA de un intento fallido (SDD §8): si no, un flujo que falla cada 5
    # minutos parecería el más sincronizado de todos.
    last_sync_at: str | None = None
    next_run_at: str | None = None
    # `None` = SIN TOPE configurado. No es lo mismo que 0, que sería "no ingerir nada".
    resolved_query_limit: int | None = None
    result_summary: RunMetricsDto | None = None


class AssetPartitionsDto(BaseModel):
    """AUSENTE (`null`) cuando el asset no está particionado — que no es lo mismo que "0 de 0"."""

    total: int
    materialized: int
    failed: int
    materializing: int
    # `None` cuando no hay particiones que cubrir: un `0.0` afirmaría "0% cubierto".
    coverage_ratio: float | None
    # De QUÉ son las partes (`provider` | `section` | `other`). Sin esto `2/41` es un número sin
    # sujeto. Lo declara el runner y lo traduce el dominio; el front solo elige la palabra.
    kind: str


class AssetAdminRowDto(BaseModel):
    key: str
    group: str
    description: str | None
    job_names: list[str]
    partitions: AssetPartitionsDto | None
    last_materialized_at: str | None
    last_run_id: str | None
    # Derivada en el DOMINIO (`PipelineAsset.health`), no acá: la misma señal la va a necesitar el
    # detalle por proveedor (#11), y dos derivaciones se desincronizan.
    health: str


class AssetListDto(BaseModel):
    assets: list[AssetAdminRowDto]


class LineageNodeDto(BaseModel):
    key: str
    direction: str  # upstream | downstream


class AssetDetailDto(AssetAdminRowDto):
    """El detalle es la fila MÁS el lineage. No es una query aparte: `dependencyKeys`/`dependedByKeys`
    son campos del nodo, así que el runner ya los trajo (por eso el puerto no tiene `get_lineage`)."""

    lineage: list[LineageNodeDto]


# ------------------------------------------------------------------------------------- helpers --

def _to_dto(policy: OrchestrationPolicy) -> PolicyDto:
    from datetime import UTC, datetime

    next_run = policy.next_run_at(datetime.now(UTC))
    return PolicyDto(
        policy_id=policy.id,
        provider_id=policy.provider_id,
        market_id=policy.market_id,
        flow_key=policy.flow_key.value if policy.flow_key else None,
        execution_mode=policy.execution_mode.value,
        cron_expression=policy.cron_expression,
        timezone=policy.timezone,
        sla_minutes=policy.sla_minutes,
        query_limit_override=policy.query_limit_override,
        enabled=policy.enabled,
        priority=policy.priority,
        next_run_at=next_run.isoformat() if next_run else None,
    )


def _require_policy(repo, policy_id: str) -> OrchestrationPolicy:  # type: ignore[no-untyped-def]
    policy = repo.get(policy_id)
    if policy is None or policy.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Policy no encontrada.")
    return policy


def _unavailable(exc: OrchestratorUnavailable) -> HTTPException:
    """503 y no 500: el runner es una dependencia EXTERNA que puede estar caída sin que nada nuestro
    esté roto. La consola degrada; la política sigue siendo editable."""
    return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"Orquestador no disponible: {exc}")


def _to_metrics_dto(snapshot) -> RunMetricsDto:  # type: ignore[no-untyped-def]
    """Proyección ÚNICA del snapshot. La lista y el detalle la comparten a propósito: dos
    proyecciones del mismo dato se desincronizan en cuanto alguien agrega un campo a una sola."""
    return RunMetricsDto(
        seen=snapshot.metrics.seen,
        refreshed=snapshot.metrics.refreshed,
        matched=snapshot.metrics.matched,
        auto_linked=snapshot.metrics.auto_linked,
        queued_for_review=snapshot.metrics.queued_for_review,
        discarded=snapshot.metrics.discarded,
        new_canonicals=snapshot.new_canonicals,
        queries_total=snapshot.metrics.queries_total,
        queries_processed=snapshot.metrics.queries_processed,
        query_progress=snapshot.metrics.query_progress,
    )


def _to_run_summary(run) -> RunSummaryDto:  # type: ignore[no-untyped-def]
    return RunSummaryDto(
        run_id=run.run_id,
        state=run.state.value,
        trigger=run.trigger,
        started_at=run.started_at.isoformat() if run.started_at else None,
        ended_at=run.ended_at.isoformat() if run.ended_at else None,
        duration_seconds=run.duration_seconds,
    )


def _to_failure_dto(failure) -> RunFailureDto | None:  # type: ignore[no-untyped-def]
    """La destilación (raíz vs envoltorio, recorte a una línea) vive en el DOMINIO — acá solo se
    copia. Repetirla en el controller daría dos versiones de "cuál es la causa" que se
    desincronizarían en cuanto alguien tocara una."""
    if failure is None:
        return None
    return RunFailureDto(
        summary=failure.summary,
        detail=failure.detail,
        root_class_name=failure.root_class_name,
    )


def _to_event_dto(event) -> RunEventDto:  # type: ignore[no-untyped-def]
    return RunEventDto(
        timestamp=event.timestamp.isoformat() if event.timestamp else None,
        level=event.level.value,
        kind=event.kind.value,
        message=event.message,
        step_key=event.step_key,
        is_noise=event.is_noise,
        has_text=event.has_text,
        failure=_to_failure_dto(event.failure),
    )


def _failure_of_run(orchestrator, run) -> RunFailureDto | None:  # type: ignore[no-untyped-def]
    """Causa del fallo de UNA corrida, pedida al runner solo si la corrida FALLÓ.

    Es un round-trip extra, y por eso está condicionado: pedirlo siempre gravaría el camino feliz
    —el 99% de las cargas— con una respuesta que se descarta.

    Si el runner se cae justo acá, se devuelve `None` en vez de propagar: la causa es un EXTRA sobre
    un detalle que tiene que seguir rindiendo con el runner caído (SDD §8). Cambiar una página
    completa por un dato accesorio sería el peor negocio posible.
    """
    if run.state is not RunState.FAILED:
        return None
    try:
        page = orchestrator.get_run_events(run.run_id)
    except OrchestratorUnavailable:
        return None
    return _to_failure_dto(page.failure) if page is not None else None


def _to_asset_row(asset: PipelineAsset) -> AssetAdminRowDto:
    p = asset.partitions
    return AssetAdminRowDto(
        key=asset.key,
        group=asset.group,
        description=asset.description,
        job_names=list(asset.job_names),
        partitions=(
            AssetPartitionsDto(
                total=p.total,
                materialized=p.materialized,
                failed=p.failed,
                materializing=p.materializing,
                coverage_ratio=p.coverage_ratio,
                kind=p.kind.value,
            )
            if p is not None
            else None
        ),
        last_materialized_at=(
            asset.last_materialized_at.isoformat() if asset.last_materialized_at else None
        ),
        last_run_id=asset.last_run_id,
        health=asset.health.value,
    )


# -------------------------------------------------------------------------------------- rutas --

@orchestration_router.get("/provider-flows", response_model=ProviderFlowListDto)
def list_provider_flows(
    policy_repo=Depends(get_orchestration_policy_repo),  # type: ignore[no-untyped-def]
    snapshot_repo=Depends(get_run_snapshot_repo),  # type: ignore[no-untyped-def]
    provider_repo=Depends(get_provider_repo),  # type: ignore[no-untyped-def]
    orchestrator: PipelineOrchestrator = Depends(get_pipeline_orchestrator),
) -> ProviderFlowListDto:
    """Lista los provider-flows con las métricas de su última corrida.

    Si el runner está caído, NO rompe: devuelve las policies con `last_run_metrics=None`. La
    política vive en nuestra DB y tiene que seguir siendo visible y editable aunque Dagster no esté
    (SDD §8) — es justamente cuando el operador más necesita mirarla.
    """
    from datetime import UTC, datetime

    now = datetime.now(UTC)
    flows: list[ProviderFlowDto] = []
    runner_available = True
    for policy in policy_repo.list_by_market(MARKET):
        metrics = None
        last_state: str | None = None
        last_run_id: str | None = None
        last_run_at = None
        last_success: datetime | None = None
        # Sin poder preguntarle al runner NO se afirma nada sobre el SLA: `not_applicable` es el
        # default honesto. Decir "incumplido" porque el orquestador está caído culparía al flujo de
        # una falla que no es suya.
        sla = SlaStatus.NOT_APPLICABLE
        try:
            runs = orchestrator.list_runs(policy_id=policy.id, limit=1)
            if runs:
                last_state = runs[0].state.value
                last_run_id = runs[0].run_id
                last_run_at = runs[0].ended_at or runs[0].started_at
                snapshot = snapshot_repo.get(runs[0].run_id)
                if snapshot is not None:
                    metrics = _to_metrics_dto(snapshot)
            # La última EXITOSA es lo que define el SLA. Si la última corrida ya lo fue, se reusa y
            # nos ahorramos el viaje; si no, se pide filtrando del lado del runner (un flujo que
            # falla seguido puede tener su último éxito a cientos de corridas de distancia).
            if runs and runs[0].state is RunState.SUCCEEDED:
                last_success = runs[0].ended_at or runs[0].started_at
            else:
                ok = orchestrator.list_runs(
                    policy_id=policy.id, limit=1, states=[RunState.SUCCEEDED]
                )
                if ok:
                    last_success = ok[0].ended_at or ok[0].started_at
            sla = policy.sla_status(last_success, now)
        except OrchestratorUnavailable:
            metrics = None  # degradado, no roto
            runner_available = False
        provider = provider_repo.get_by_id(policy.provider_id) if policy.provider_id else None
        flows.append(ProviderFlowDto(
            provider_name=provider.name if provider else None,
            provider_logo_url=getattr(provider, "logo_url", None) if provider else None,
            policy=_to_dto(policy),
            last_run_metrics=metrics,
            last_run_state=last_state,
            last_run_id=last_run_id,
            last_run_at=last_run_at.isoformat() if last_run_at else None,
            sla_status=sla.value,
            last_success_at=last_success.isoformat() if last_success else None,
        ))
    return ProviderFlowListDto(runner_available=runner_available, flows=flows)


@orchestration_router.post(
    "/provider-flows", response_model=PolicyDto, status_code=status.HTTP_201_CREATED
)
def create_provider_flow(
    body: CreateProviderFlowRequest,
    use_case: CreateProviderFlow = Depends(get_create_provider_flow),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> PolicyDto:
    try:
        policy = use_case.execute(
            provider_id=body.provider_id,
            market_id=MARKET,
            flow_key=body.flow_key,
            timezone=body.timezone,
        )
    except ProviderFlowNotSupported as exc:
        # 422 con el MOTIVO: el operador necesita saber si es que la tienda no tiene fuente, está
        # apagada, o su plataforma no sabe hacer lo que el flow requiere.
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    audit.record(
        "orchestration.provider_flow.create",
        "orchestration_policy",
        policy.id,
        {"provider_id": body.provider_id, "flow_key": body.flow_key.value},
    )
    return _to_dto(policy)


@orchestration_router.patch("/policies/{policy_id}", response_model=PolicyDto)
def update_policy(
    policy_id: str,
    body: UpdatePolicyRequest,
    policy_repo=Depends(get_orchestration_policy_repo),  # type: ignore[no-untyped-def]
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> PolicyDto:
    from dataclasses import replace

    policy = _require_policy(policy_repo, policy_id)
    changes = body.model_dump(exclude_unset=True)
    try:
        # La validación vive en la ENTIDAD (p.ej. "solo `cron` admite cron_expression"): construirla
        # es lo que la dispara, y así la regla no se duplica en el borde.
        updated = replace(policy, **changes)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    policy_repo.save(updated)
    audit.record("orchestration.policy.update", "orchestration_policy", policy_id, changes)
    return _to_dto(updated)


@orchestration_router.post("/policies/{policy_id}/pause", response_model=PolicyDto)
def pause_policy(
    policy_id: str,
    policy_repo=Depends(get_orchestration_policy_repo),  # type: ignore[no-untyped-def]
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> PolicyDto:
    from dataclasses import replace

    updated = replace(_require_policy(policy_repo, policy_id), enabled=False)
    policy_repo.save(updated)
    audit.record("orchestration.policy.pause", "orchestration_policy", policy_id, {})
    return _to_dto(updated)


@orchestration_router.post("/policies/{policy_id}/resume", response_model=PolicyDto)
def resume_policy(
    policy_id: str,
    policy_repo=Depends(get_orchestration_policy_repo),  # type: ignore[no-untyped-def]
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> PolicyDto:
    from dataclasses import replace

    updated = replace(_require_policy(policy_repo, policy_id), enabled=True)
    policy_repo.save(updated)
    audit.record("orchestration.policy.resume", "orchestration_policy", policy_id, {})
    return _to_dto(updated)


@orchestration_router.delete("/policies/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_policy(
    policy_id: str,
    policy_repo=Depends(get_orchestration_policy_repo),  # type: ignore[no-untyped-def]
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> None:
    """SOFT-delete (§5.3). Nunca hard-delete: el histórico de runs referencia esta policy y es
    append-only y sagrado."""
    policy_repo.save(soft_delete(_require_policy(policy_repo, policy_id)))
    audit.record("orchestration.policy.delete", "orchestration_policy", policy_id, {"soft": True})


@orchestration_router.post("/policies/{policy_id}/run", response_model=RunLaunchedDto)
def run_policy_now(
    policy_id: str,
    policy_repo=Depends(get_orchestration_policy_repo),  # type: ignore[no-untyped-def]
    orchestrator: PipelineOrchestrator = Depends(get_pipeline_orchestrator),
    actor_user_id: str = Depends(get_current_user_id),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> RunLaunchedDto:
    policy = _require_policy(policy_repo, policy_id)
    try:
        run_id = RunPolicyNow(orchestrator=orchestrator).execute(
            policy=policy, actor_user_id=actor_user_id
        )
    except ProviderFlowNotSupported as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except OrchestratorUnavailable as exc:
        raise _unavailable(exc) from exc
    audit.record(
        "orchestration.run.launch", "orchestration_policy", policy_id, {"run_id": run_id}
    )
    return RunLaunchedDto(run_id=run_id)


@orchestration_router.post("/runs/{run_id}/retry", response_model=RunLaunchedDto)
def retry_run(
    run_id: str,
    orchestrator: PipelineOrchestrator = Depends(get_pipeline_orchestrator),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> RunLaunchedDto:
    """Re-ejecuta DESDE EL FALLO (semántica oficial del runner), no desde cero: re-correr todo no
    sería un reintento sino una corrida nueva, y esa tiene su propio botón."""
    try:
        new_run_id = orchestrator.retry(run_id)
    except OrchestratorUnavailable as exc:
        raise _unavailable(exc) from exc
    audit.record("orchestration.run.retry", "run", run_id, {"new_run_id": new_run_id})
    return RunLaunchedDto(run_id=new_run_id)


@orchestration_router.post("/runs/{run_id}/cancel", status_code=status.HTTP_204_NO_CONTENT)
def cancel_run(
    run_id: str,
    orchestrator: PipelineOrchestrator = Depends(get_pipeline_orchestrator),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> None:
    try:
        orchestrator.cancel(run_id)
    except OrchestratorUnavailable as exc:
        raise _unavailable(exc) from exc
    audit.record("orchestration.run.cancel", "run", run_id, {})


@orchestration_router.get(
    "/providers/{provider_id}", response_model=ProviderOrchestrationDetailDto
)
def get_provider_detail(
    provider_id: str,
    flow_key: FlowKey = FlowKey.PROVIDER_PRICES_REFRESH,
    policy_repo=Depends(get_orchestration_policy_repo),  # type: ignore[no-untyped-def]
    config_repo=Depends(get_orchestration_config_repo),  # type: ignore[no-untyped-def]
    snapshot_repo=Depends(get_run_snapshot_repo),  # type: ignore[no-untyped-def]
    provider_repo=Depends(get_provider_repo),  # type: ignore[no-untyped-def]
    orchestrator: PipelineOrchestrator = Depends(get_pipeline_orchestrator),
) -> ProviderOrchestrationDetailDto:
    """Detalle operativo de un provider-flow (#11).

    Igual que la lista: si el runner no responde NO rompe. La policy vive en nuestra DB y tiene que
    seguir siendo visible y editable — es justo cuando el operador más necesita mirarla (SDD §8).
    Lo que se degrada es la parte que depende del runner, y se DECLARA con `runner_available`.
    """
    from datetime import UTC, datetime

    provider = provider_repo.get_by_id(provider_id)
    policy = policy_repo.find_active(
        provider_id=provider_id, market_id=MARKET, flow_key=flow_key.value
    )
    if provider is None or policy is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Provider-flow no encontrado.")

    now = datetime.now(UTC)
    runner_available = True
    current: RunSummaryDto | None = None
    last_ok: RunSummaryDto | None = None
    summary: RunMetricsDto | None = None
    last_success_at: datetime | None = None
    try:
        runs = orchestrator.list_runs(policy_id=policy.id, limit=1)
        if runs:
            current = _to_run_summary(runs[0])
            # US-OR-D2: la causa va en la card de "Última corrida", no enterrada en la línea de
            # tiempo. Viaja en ESTE mismo viaje (el detalle es SSR) para que el operador la lea al
            # cargar, sin un ida y vuelta desde el navegador.
            current = current.model_copy(
                update={"failure": _failure_of_run(orchestrator, runs[0])}
            )
            snapshot = snapshot_repo.get(runs[0].run_id)
            if snapshot is not None:
                summary = _to_metrics_dto(snapshot)
        # La última EXITOSA define el SLA y `last_sync_at`. Si la última ya lo fue, se reusa; si no,
        # se pide filtrando DEL LADO DEL RUNNER (un flujo que falla seguido puede tener su último
        # éxito a cientos de corridas de distancia).
        if runs and runs[0].state is RunState.SUCCEEDED:
            successful = runs[0]
        else:
            found = orchestrator.list_runs(
                policy_id=policy.id, limit=1, states=[RunState.SUCCEEDED]
            )
            successful = found[0] if found else None
        if successful is not None:
            last_ok = _to_run_summary(successful)
            last_success_at = successful.ended_at or successful.started_at
    except OrchestratorUnavailable:
        # Sin poder preguntar NO se afirma nada del SLA: decir "incumplido" porque el orquestador
        # está caído culparía al flujo de una falla que no es suya.
        runner_available = False

    next_run = policy.next_run_at(now)
    return ProviderOrchestrationDetailDto(
        provider_id=provider_id,
        provider_name=provider.name,
        provider_logo_url=getattr(provider, "logo_url", None),
        market_id=MARKET,
        flow_key=flow_key.value,
        policy=_to_dto(policy),
        runner_available=runner_available,
        current_run=current,
        last_successful_run=last_ok,
        sla_status=(
            policy.sla_status(last_success_at, now).value
            if runner_available
            else SlaStatus.NOT_APPLICABLE.value
        ),
        last_sync_at=last_success_at.isoformat() if last_success_at else None,
        next_run_at=next_run.isoformat() if next_run else None,
        # La precedencia vive en el DOMINIO; acá solo se cargan las piezas. Es la MISMA regla que
        # ahora gobierna la ingesta (`composition.resolve_query_limit`), así que el número que el
        # operador ve es el que de verdad recorta la corrida.
        resolved_query_limit=policy.query_limit_effective(config_repo.get(MARKET)),
        result_summary=summary,
    )


@orchestration_router.get(
    "/providers/{provider_id}/runs", response_model=RunHistoryDto
)
def list_provider_runs(
    provider_id: str,
    flow_key: FlowKey = FlowKey.PROVIDER_PRICES_REFRESH,
    limit: int = 20,
    cursor: str | None = None,
    policy_repo=Depends(get_orchestration_policy_repo),  # type: ignore[no-untyped-def]
    orchestrator: PipelineOrchestrator = Depends(get_pipeline_orchestrator),
) -> RunHistoryDto:
    """Histórico paginado de un provider-flow (US-OR-D6).

    A diferencia del detalle, esto NO degrada: el histórico vive SOLO en el runner. Sin él no hay
    nada honesto que paginar → 503, no una lista vacía que se leería como "nunca corrió".
    """
    policy = policy_repo.find_active(
        provider_id=provider_id, market_id=MARKET, flow_key=flow_key.value
    )
    if policy is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Provider-flow no encontrado.")
    try:
        runs = orchestrator.list_runs(policy_id=policy.id, limit=limit, cursor=cursor)
    except OrchestratorUnavailable as exc:
        raise _unavailable(exc) from exc
    # Cursor de la próxima página = id de la última fila, PERO solo si vino una página llena. Con
    # menos filas que el límite ya no hay más, y devolver un cursor invitaría a un viaje extra que
    # regresa vacío.
    next_cursor = runs[-1].run_id if len(runs) == limit and runs else None
    return RunHistoryDto(
        runs=[_to_run_summary(r) for r in runs],
        next_cursor=next_cursor,
    )


@orchestration_router.get(
    "/providers/{provider_id}/runs/{run_id}/events", response_model=RunEventPageDto
)
def get_run_events(
    provider_id: str,
    run_id: str,
    flow_key: FlowKey = FlowKey.PROVIDER_PRICES_REFRESH,
    limit: int = 200,
    cursor: str | None = None,
    policy_repo=Depends(get_orchestration_policy_repo),  # type: ignore[no-untyped-def]
    orchestrator: PipelineOrchestrator = Depends(get_pipeline_orchestrator),
) -> RunEventPageDto:
    """Línea de tiempo de UNA corrida (US-OR-D7).

    Como el histórico, esto NO degrada: los eventos viven SOLO en el runner, así que sin él no hay
    nada honesto que mostrar → 503, no una lista vacía que se leería como "no pasó nada".

    La corrida se pide bajo el provider-flow y no suelta para que la ruta sea la misma superficie
    que ya está autorizada: sin la policy no hay a quién pertenece esa corrida, y un endpoint de
    logs sin dueño es una puerta a los eventos de CUALQUIER corrida del runner.

    Es una LECTURA: no se audita (T2 registra mutaciones; auditar lecturas ahogaría el registro).
    """
    policy = policy_repo.find_active(
        provider_id=provider_id, market_id=MARKET, flow_key=flow_key.value
    )
    if policy is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Provider-flow no encontrado.")
    try:
        page = orchestrator.get_run_events(run_id, cursor=cursor, limit=limit)
    except OrchestratorUnavailable as exc:
        raise _unavailable(exc) from exc
    if page is None:
        # "Esa corrida no existe" es una RESPUESTA del runner, no una caída. Devolver 503 haría que
        # la consola dijera "el orquestador no responde" con el orquestador respondiendo.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Corrida no encontrada.")
    return RunEventPageDto(
        events=[_to_event_dto(e) for e in page.events],
        next_cursor=page.next_cursor,
        failure=_to_failure_dto(page.failure),
    )


@orchestration_router.get("/assets", response_model=AssetListDto)
def list_assets(
    orchestrator: PipelineOrchestrator = Depends(get_pipeline_orchestrator),
) -> AssetListDto:
    """Todos los assets del pipeline (§14 #9).

    A diferencia de `/provider-flows`, esto NO degrada: las policies viven en NUESTRA DB, pero los
    assets viven SOLO en Dagster. Devolver una lista vacía diría "el pipeline no tiene assets" cuando
    la verdad es "no pudimos preguntar" — y esa es la mentira más cara que este módulo puede contar.
    Runner caído ⇒ 503, y la tab lo declara.

    Es una LECTURA: no se audita (T2 registra mutaciones; auditar lecturas ahogaría el registro).
    """
    try:
        assets = orchestrator.list_assets()
    except OrchestratorUnavailable as exc:
        raise _unavailable(exc) from exc
    return AssetListDto(assets=[_to_asset_row(a) for a in assets])


@orchestration_router.get("/assets/{key:path}", response_model=AssetDetailDto)
def get_asset(
    key: str,
    orchestrator: PipelineOrchestrator = Depends(get_pipeline_orchestrator),
) -> AssetDetailDto:
    """Detalle + lineage de un asset.

    `{key:path}` y no `{key}` porque `AssetKey` es una LISTA de segmentos que la consola une con `/`:
    con el converter por defecto, todo asset multi-segmento sería inalcanzable (404 sin explicación).
    """
    try:
        asset = orchestrator.get_asset(key)
    except OrchestratorUnavailable as exc:
        raise _unavailable(exc) from exc
    if asset is None:
        # 404 y NO 503: "ese asset no existe" es una respuesta del runner, no una caída suya.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset no encontrado.")
    row = _to_asset_row(asset)
    return AssetDetailDto(
        **row.model_dump(),
        lineage=[
            *(LineageNodeDto(key=k, direction="upstream") for k in asset.dependency_keys),
            *(LineageNodeDto(key=k, direction="downstream") for k in asset.depended_by_keys),
        ],
    )
