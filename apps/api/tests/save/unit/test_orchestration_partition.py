"""Unit — partición del launch (F4, fix del bug "Cannot access partition_key for a non-partitioned
run"). El job `save_query_catalog` está particionado por provider_id; lanzarlo SIN partición hace que
el asset reviente al leer `context.partition_key`. `partition_key_for` es la fuente ÚNICA (igual que
`JOB_BY_FLOW`) que consumen "Ejecutar ahora" (`RunPolicyNow`) y el sensor programado.
"""
from __future__ import annotations

from src.contexts.save.domain.entities.orchestration import (
    JOB_BY_FLOW,
    PROVIDER_PARTITIONED_FLOWS,
    FlowKey,
    partition_key_for,
)


def test_provider_partitioned_flow_launches_with_the_provider_as_partition() -> None:
    key = partition_key_for(FlowKey.PROVIDER_PRICES_REFRESH.value, "prov-123")
    assert key == "prov-123"


def test_a_non_partitioned_flow_gets_no_partition() -> None:
    # Un flow desconocido (o cuyo job no está particionado) NO debe recibir partición: pasársela
    # rompería del lado opuesto ("job is not partitioned").
    assert partition_key_for("some_unpartitioned_flow", "prov-123") is None


def test_every_partitioned_flow_has_a_job() -> None:
    # Guarda de consistencia: declarar una partición para un flow sin job soportado sería una
    # trampa silenciosa (misma doctrina que JOB_BY_FLOW, gotcha #17).
    assert PROVIDER_PARTITIONED_FLOWS <= set(JOB_BY_FLOW)


def test_the_price_refresh_flow_is_partitioned_by_provider() -> None:
    """`price_refresh` era GLOBAL: una cola de 500 ordenada por antigüedad, compartida por todos.
    Medido 2026-08-02: el cupo entero (500/500) se lo llevó Bravo y Sirena no recibía refresco."""
    assert FlowKey.PROVIDER_PRICE_REFRESH.value in PROVIDER_PARTITIONED_FLOWS
    assert partition_key_for(FlowKey.PROVIDER_PRICE_REFRESH.value, "prov-9") == "prov-9"
    assert JOB_BY_FLOW[FlowKey.PROVIDER_PRICE_REFRESH.value] == "save_price_refresh"


# --- Policies de scope ASSET: los jobs GLOBALES también se programan desde el admin -----------


def test_a_global_asset_resolves_its_job_without_a_flow() -> None:
    from src.contexts.save.domain.entities.orchestration import JOB_BY_ASSET, job_for

    assert job_for(flow_key=None, asset_key="freshness") == JOB_BY_ASSET["freshness"]
    assert job_for(flow_key=None, asset_key="coverage") == JOB_BY_ASSET["coverage"]


def test_a_provider_flow_still_resolves_by_flow_key() -> None:
    from src.contexts.save.domain.entities.orchestration import job_for

    assert job_for(flow_key=FlowKey.PROVIDER_PRICES_REFRESH.value, asset_key=None) == "save_query_catalog"


def test_an_unknown_asset_gets_no_job_instead_of_guessing() -> None:
    """Cerrado a propósito: v1 no materializa assets Python arbitrarios desde la UI (SDD §4)."""
    from src.contexts.save.domain.entities.orchestration import job_for

    assert job_for(flow_key=None, asset_key="cualquier_cosa") is None
    assert job_for(flow_key=None, asset_key=None) is None


def test_global_assets_are_not_provider_partitioned() -> None:
    # Pasarle partición a un job no particionado rompe del lado opuesto ("job is not partitioned").
    from src.contexts.save.domain.entities.orchestration import JOB_BY_ASSET

    assert not (set(JOB_BY_ASSET.values()) & set(PROVIDER_PARTITIONED_FLOWS))


# --- Browse por sección: UNA policy produce N corridas (backfill) ------------------------------
# `save_rest_catalog` particiona por `{provider}:{sección}` (41 en Bravo), así que no alcanza con
# `launchRun`: se lanza como backfill y sus corridas heredan el tag de la policy (verificado contra
# el schema instalado: `LaunchBackfillParams.tags`).


def test_the_browse_flow_is_launched_as_a_backfill_not_a_single_run() -> None:
    from src.contexts.save.domain.entities.orchestration import BACKFILL_FLOWS

    assert FlowKey.PROVIDER_BROWSE.value in BACKFILL_FLOWS
    assert JOB_BY_FLOW[FlowKey.PROVIDER_BROWSE.value] == "save_rest_catalog"


def test_the_browse_flow_is_not_provider_partitioned() -> None:
    # Su partición NO es el provider a secas: es `{provider}:{sección}`. Tratarlo como los otros
    # lanzaría una corrida con una partición inexistente.
    assert FlowKey.PROVIDER_BROWSE.value not in PROVIDER_PARTITIONED_FLOWS
    assert partition_key_for(FlowKey.PROVIDER_BROWSE.value, "prov-1") is None


def test_browse_partition_keys_are_one_per_section() -> None:
    from src.contexts.save.domain.entities.orchestration import browse_partition_keys

    assert browse_partition_keys("prov-1", ["3", "14"]) == ["prov-1:3", "prov-1:14"]
    assert browse_partition_keys("prov-1", []) == []
