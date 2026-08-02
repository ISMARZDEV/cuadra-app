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
        self.backfill_kwargs: dict | None = None

    def launch(self, **kwargs):  # type: ignore[no-untyped-def]
        self.launch_kwargs = kwargs
        return "run-xyz"

    def __init_backfill(self):  # pragma: no cover
        pass

    def launch_backfill(self, **kwargs):  # type: ignore[no-untyped-def]
        self.backfill_kwargs = kwargs
        return "bf-1"


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


# --- Browse: UNA policy, N particiones -------------------------------------------------------


class _FakeSections:
    """Las secciones del proveedor viven en `store_registry.endpoints`."""

    def __init__(self, sections):  # type: ignore[no-untyped-def]
        self._sections = sections

    def sections_for(self, provider_id: str):  # type: ignore[no-untyped-def]
        return self._sections


def test_the_browse_flow_launches_a_backfill_with_one_partition_per_section() -> None:
    """`save_rest_catalog` particiona por `{provider}:{sección}`. Con `launchRun` correría UNA
    sección y las otras 40 quedarían sin ejecutar, sin que nada avisara."""
    orch = _FakeOrchestrator()
    uc = RunPolicyNow(orchestrator=orch, sections_reader=_FakeSections(["3", "14"]))

    result = uc.execute(
        policy=_policy(flow_key=FlowKey.PROVIDER_BROWSE, provider_id="prov-bravo"),
        actor_user_id="u-9",
    )

    assert result == "bf-1"
    assert orch.launch_kwargs is None, "el browse NO se lanza como corrida única"
    assert orch.backfill_kwargs["job_name"] == "save_rest_catalog"
    assert orch.backfill_kwargs["partition_keys"] == ["prov-bravo:3", "prov-bravo:14"]


def test_a_browse_without_sections_fails_loudly_instead_of_launching_nothing() -> None:
    orch = _FakeOrchestrator()
    uc = RunPolicyNow(orchestrator=orch, sections_reader=_FakeSections([]))

    import pytest

    from src.contexts.save.application.orchestration_policies import ProviderFlowNotSupported

    with pytest.raises(ProviderFlowNotSupported):
        uc.execute(policy=_policy(flow_key=FlowKey.PROVIDER_BROWSE, provider_id="prov-bravo"))
