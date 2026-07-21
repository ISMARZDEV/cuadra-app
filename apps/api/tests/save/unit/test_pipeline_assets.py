"""El vocabulario de ASSETS de la consola (§14 #9) — reglas de dominio, sin runner de por medio.

Por qué estas reglas viven acá y no en el front: son las mismas que va a necesitar el detalle por
proveedor (#11). Duplicar la derivación en dos pantallas es la forma exacta en que la consola
terminaría diciendo dos cosas distintas del mismo asset — el mismo motivo por el que el SLA se
resolvió en la entidad (gotcha #19) y no en `buildKpis`.
"""
from __future__ import annotations

from datetime import UTC, datetime

from src.contexts.save.domain.ports.orchestrator import (
    AssetHealth,
    AssetPartitionKind,
    AssetPartitionStats,
    PipelineAsset,
)


def _asset(**over: object) -> PipelineAsset:
    base: dict[str, object] = {
        "key": "query_catalog_prices",
        "group": "default",
        "description": None,
        "job_names": ("save_query_catalog",),
        "dependency_keys": (),
        "depended_by_keys": (),
        "partitions": None,
        "last_materialized_at": None,
        "last_run_id": None,
    }
    base.update(over)
    return PipelineAsset(**base)  # type: ignore[arg-type]


class TestPartitionStats:
    def test_a_non_partitioned_asset_has_no_stats_at_all(self) -> None:
        """`None` != `0 de 0`. Un asset no particionado no tiene una cobertura del 0%: no tiene
        cobertura, punto. Pintar `0/0` sería la misma mentira que el gauge al 0% sin datos — un cero
        es una AFIRMACIÓN, y acá no hay nada que afirmar."""
        assert _asset(partitions=None).partitions is None

    def test_coverage_is_none_when_there_are_no_partitions_to_cover(self) -> None:
        """Denominador 0 → `None`, nunca una división que invente un 0% o reviente."""
        stats = AssetPartitionStats(total=0, materialized=0, failed=0, materializing=0)
        assert stats.coverage_ratio is None

    def test_coverage_counts_only_materialized_over_total(self) -> None:
        stats = AssetPartitionStats(total=10, materialized=4, failed=2, materializing=1)
        assert stats.coverage_ratio == 0.4


class TestAssetHealth:
    def test_never_materialized_is_not_a_failure(self) -> None:
        """La distinción que costó cara en F4 con el runner: "nunca corrió" NO es "está roto".
        Fusionarlos haría que un deploy nuevo mostrara todo el pipeline en rojo estando sano."""
        assert _asset(last_materialized_at=None).health is AssetHealth.NEVER_MATERIALIZED

    def test_a_materialized_asset_with_no_partitions_is_healthy(self) -> None:
        assert _asset(last_materialized_at=datetime(2026, 7, 20, tzinfo=UTC)).health is AssetHealth.HEALTHY

    def test_one_failed_partition_degrades_but_does_not_condemn_the_asset(self) -> None:
        """`rest_catalog_prices` particiona por sección: que una sección falle no significa que el
        browse de Bravo esté caído. Marcarlo FAILED mandaría al operador a arreglar algo que
        mayormente funciona."""
        asset = _asset(
            last_materialized_at=datetime(2026, 7, 20, tzinfo=UTC),
            partitions=AssetPartitionStats(total=10, materialized=9, failed=1, materializing=0),
        )
        assert asset.health is AssetHealth.DEGRADED

    def test_every_partition_failing_is_a_real_failure(self) -> None:
        asset = _asset(
            last_materialized_at=datetime(2026, 7, 20, tzinfo=UTC),
            partitions=AssetPartitionStats(total=4, materialized=0, failed=4, materializing=0),
        )
        assert asset.health is AssetHealth.FAILED

    def test_a_partition_in_flight_does_not_count_as_failure(self) -> None:
        asset = _asset(
            last_materialized_at=datetime(2026, 7, 20, tzinfo=UTC),
            partitions=AssetPartitionStats(total=4, materialized=3, failed=0, materializing=1),
        )
        assert asset.health is AssetHealth.HEALTHY


class TestLineage:
    def test_lineage_travels_with_the_node_because_it_is_a_FIELD_not_a_query(self) -> None:
        """Verificado por introspección del schema instalado: `AssetNode.dependencyKeys` y
        `dependedByKeys` son campos del nodo. Por eso NO existe `get_lineage()` en el puerto: un
        método aparte sería un segundo round-trip al runner para recomponer lo que la primera
        llamada ya trajo. `list_assets()` devuelve el grafo COMPLETO."""
        asset = _asset(
            dependency_keys=("embed_canonicals",),
            depended_by_keys=("price_drops", "alert_matching"),
        )
        assert asset.dependency_keys == ("embed_canonicals",)
        assert asset.depended_by_keys == ("price_drops", "alert_matching")


class TestPartitionKind:
    """El número `3/4` no dice de QUÉ son esas partes, y por sí solo no significa nada para el
    operador. El TIPO de partición lo declara el runner (`partitionDefinition.name`) y el dominio lo
    traduce a un vocabulario propio — el front solo elige la palabra."""

    def test_a_provider_partition_is_recognised(self) -> None:
        stats = AssetPartitionStats(
            total=4, materialized=3, failed=0, materializing=0,
            kind=AssetPartitionKind.PROVIDER,
        )
        assert stats.kind is AssetPartitionKind.PROVIDER

    def test_an_unknown_partition_falls_back_to_generic_parts(self) -> None:
        """Una partición nueva que nadie mapeó NO puede romper la tabla ni inventar un nombre: cae en
        `OTHER` y la UI dice "partes", que es cierto aunque sea vago."""
        stats = AssetPartitionStats(total=1, materialized=1, failed=0, materializing=0)
        assert stats.kind is AssetPartitionKind.OTHER
