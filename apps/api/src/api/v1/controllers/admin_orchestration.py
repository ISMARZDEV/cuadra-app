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
)
from src.contexts.save.domain.ports.orchestrator import (
    OrchestratorUnavailable,
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
    policy: PolicyDto
    last_run_metrics: RunMetricsDto | None


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


# -------------------------------------------------------------------------------------- rutas --

@orchestration_router.get("/provider-flows", response_model=list[ProviderFlowDto])
def list_provider_flows(
    policy_repo=Depends(get_orchestration_policy_repo),  # type: ignore[no-untyped-def]
    snapshot_repo=Depends(get_run_snapshot_repo),  # type: ignore[no-untyped-def]
    orchestrator: PipelineOrchestrator = Depends(get_pipeline_orchestrator),
) -> list[ProviderFlowDto]:
    """Lista los provider-flows con las métricas de su última corrida.

    Si el runner está caído, NO rompe: devuelve las policies con `last_run_metrics=None`. La
    política vive en nuestra DB y tiene que seguir siendo visible y editable aunque Dagster no esté
    (SDD §8) — es justamente cuando el operador más necesita mirarla.
    """
    flows: list[ProviderFlowDto] = []
    for policy in policy_repo.list_by_market(MARKET):
        metrics = None
        try:
            runs = orchestrator.list_runs(policy_id=policy.id, limit=1)
            if runs:
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
        except OrchestratorUnavailable:
            metrics = None  # degradado, no roto
        flows.append(ProviderFlowDto(policy=_to_dto(policy), last_run_metrics=metrics))
    return flows


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
