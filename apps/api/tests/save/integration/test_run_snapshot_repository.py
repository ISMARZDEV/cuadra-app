"""Integration — snapshot de métricas por corrida (F4 #4.5).

Qué se persiste y qué NO:

  - **Se persiste** lo que produce NUESTRA ingesta (seen/refreshed/auto_linked/…). Dagster no lo
    sabe, y su event log es purgable: §5.3 dice que el histórico de runs es append-only y SAGRADO,
    así que no puede vivir solo en un store externo que alguien puede limpiar.
  - **NO se persiste el estado** (`running`/`succeeded`/…). Esta fila la escribe la corrida DESDE
    ADENTRO, así que el estado que conociera sería siempre "en curso": una columna garantizada a
    estar mal. El estado lo da el bridge en vivo.
  - **`new_canonicals_count` NO es una columna**: se DERIVA por join contra los canónicos atribuidos
    a la corrida. Guardarlo congelaría un número que sigue creciendo mientras el operador resuelve
    la cola días después.
"""
from __future__ import annotations

import uuid

from src.contexts.save.infrastructure.models import CanonicalProductModel, TaxonomyNodeModel
from src.contexts.save.infrastructure.orchestrator.run_snapshot_repository import (
    SqlRunSnapshotRepository,
)
from src.contexts.save.domain.entities.orchestration_run import RunMetrics


def _taxonomy(db_session) -> uuid.UUID:  # type: ignore[no-untyped-def]
    node = TaxonomyNodeModel(id=uuid.uuid4(), name=f"Cat {uuid.uuid4().hex[:6]}", level=1,
                             market_id="DO")
    db_session.add(node)
    db_session.flush()
    return node.id


def _canonical(db_session, taxonomy_id, origin_run_id: str | None):  # type: ignore[no-untyped-def]
    db_session.add(CanonicalProductModel(
        id=uuid.uuid4(),
        slug=f"p-{uuid.uuid4().hex[:8]}",
        name="Arroz",
        size_amount=1,
        size_measure="LB",
        taxonomy_node_id=taxonomy_id,
        market_id="DO",
        origin_run_id=origin_run_id,
    ))
    db_session.flush()


def _metrics(**over) -> RunMetrics:  # type: ignore[no-untyped-def]
    base = dict(seen=10, refreshed=4, unmatched=0, matched=6, discarded=1,
                auto_linked=5, queued_for_review=1)
    base.update(over)
    return RunMetrics(**base)  # type: ignore[arg-type]


def test_records_the_metrics_of_a_run(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = SqlRunSnapshotRepository(db_session)

    repo.record(dagster_run_id="run-1", market_id="DO", metrics=_metrics(), provider_id=None,
                policy_id=None, flow_key="provider_prices_refresh")
    db_session.flush()

    snapshot = repo.get("run-1")
    assert snapshot is not None
    assert snapshot.metrics.seen == 10
    assert snapshot.metrics.auto_linked == 5
    assert snapshot.metrics.queued_for_review == 1


def test_recording_the_same_run_twice_updates_instead_of_duplicating(db_session) -> None:  # type: ignore[no-untyped-def]
    """Un reintento de la MISMA corrida no puede dejar dos filas: el operador vería la corrida
    duplicada y los totales sumados dos veces."""
    repo = SqlRunSnapshotRepository(db_session)

    repo.record(dagster_run_id="run-1", market_id="DO", metrics=_metrics(seen=10),
                provider_id=None, policy_id=None, flow_key="f")
    repo.record(dagster_run_id="run-1", market_id="DO", metrics=_metrics(seen=99),
                provider_id=None, policy_id=None, flow_key="f")
    db_session.flush()

    assert repo.get("run-1").metrics.seen == 99  # type: ignore[union-attr]


def test_new_canonicals_are_derived_by_attribution_not_stored(db_session) -> None:  # type: ignore[no-untyped-def]
    """El conteo tiene que reflejar el trabajo humano que sigue OCURRIENDO: un operador puede
    resolver la cola de una corrida días después. Un número congelado al terminar la corrida diría
    siempre cero — que es exactamente lo que #4.3 demostró."""
    repo = SqlRunSnapshotRepository(db_session)
    repo.record(dagster_run_id="run-1", market_id="DO", metrics=_metrics(),
                provider_id=None, policy_id=None, flow_key="f")
    db_session.flush()
    assert repo.get("run-1").new_canonicals == 0  # type: ignore[union-attr]

    tax = _taxonomy(db_session)
    _canonical(db_session, tax, origin_run_id="run-1")
    _canonical(db_session, tax, origin_run_id="run-1")
    _canonical(db_session, tax, origin_run_id="otra-corrida")
    _canonical(db_session, tax, origin_run_id=None)  # bootstrap: no vino de ninguna corrida

    assert repo.get("run-1").new_canonicals == 2  # type: ignore[union-attr]


def test_an_unknown_run_has_no_snapshot(db_session) -> None:  # type: ignore[no-untyped-def]
    assert SqlRunSnapshotRepository(db_session).get("no-existe") is None
