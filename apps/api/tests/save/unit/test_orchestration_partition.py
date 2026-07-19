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
