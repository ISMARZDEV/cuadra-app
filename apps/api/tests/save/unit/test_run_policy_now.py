"""Unit — RunPolicyNow ("Ejecutar ahora"), fix del launch particionado (F4).

El bug: lanzaba `save_query_catalog` (particionado por provider_id) SIN partición → la corrida moría
a los 3s con `Cannot access partition_key for a non-partitioned run`. Pasaba verde porque `launchRun`
devuelve un run_id (Dagster ACEPTA el lanzamiento) y la falla ocurría al ejecutar el asset — el test
de wiring tiene que verificar QUÉ se le pasa al launch, no solo que retorne un id.
"""
from __future__ import annotations

from src.contexts.save.application.orchestration_policies import RunPolicyNow
from src.contexts.save.domain.entities.orchestration import (
    ExecutionMode,
    FlowKey,
    PolicyScope,
    OrchestrationPolicy,
)
from src.contexts.save.domain.ports.orchestrator import RunTrigger


class _FakeOrchestrator:
    def __init__(self) -> None:
        self.launch_kwargs: dict | None = None

    def launch(self, **kwargs):  # type: ignore[no-untyped-def]
        self.launch_kwargs = kwargs
        return "run-xyz"


def _policy(**over) -> OrchestrationPolicy:  # type: ignore[no-untyped-def]
    base = dict(
        id="pol-1",
        scope=PolicyScope.PROVIDER_FLOW,
        market_id="DO",
        timezone="America/Santo_Domingo",
        execution_mode=ExecutionMode.MANUAL,
        provider_id="prov-sirena",
        flow_key=FlowKey.PROVIDER_PRICES_REFRESH,
    )
    base.update(over)
    return OrchestrationPolicy(**base)


def test_launches_the_provider_partitioned_flow_with_the_provider_as_partition() -> None:
    orch = _FakeOrchestrator()
    run_id = RunPolicyNow(orchestrator=orch).execute(policy=_policy(), actor_user_id="u-9")

    assert run_id == "run-xyz"
    assert orch.launch_kwargs is not None
    assert orch.launch_kwargs["job_name"] == "save_query_catalog"
    assert orch.launch_kwargs["policy_id"] == "pol-1"
    # LO QUE ARREGLA EL BUG: la partición viaja = el provider de la policy.
    assert orch.launch_kwargs["partition_key"] == "prov-sirena"
    assert orch.launch_kwargs["trigger"] is RunTrigger.MANUAL
