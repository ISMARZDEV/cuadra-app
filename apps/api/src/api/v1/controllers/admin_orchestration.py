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
                snapshot = snapshot_repo.get(runs[0].run_id)
                if snapshot is not None:
                    metrics = RunMetricsDto(
                        seen=snapshot.metrics.seen,
                        refreshed=snapshot.metrics.refreshed,
                        matched=snapshot.metrics.matched,
                        auto_linked=snapshot.metrics.auto_linked,
                        queued_for_review=snapshot.metrics.queued_for_review,
                        discarded=snapshot.metrics.discarded,
                        new_canonicals=snapshot.new_canonicals,
                    )
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
