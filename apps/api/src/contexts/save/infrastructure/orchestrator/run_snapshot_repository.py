"""Persistencia de las métricas por corrida (F4 #4.5).

La división que sostiene todo el módulo: **Dagster es dueño del ESTADO de una corrida; nosotros
somos dueños de lo que esa corrida PRODUJO.** El event log de Dagster es purgable y su API está
declarada inestable; §5.3 dice que el histórico de runs es append-only y sagrado, así que nuestras
métricas no pueden vivir solo ahí.
"""
from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...domain.entities.orchestration_run import RunMetrics, RunSnapshot
from ..models import CanonicalProductModel, OrchestrationRunSnapshotModel

_FIELDS = ("seen", "refreshed", "unmatched", "matched", "discarded",
           "auto_linked", "queued_for_review", "queries_total", "queries_processed")


class SqlRunSnapshotRepository:
    def __init__(self, session: Session) -> None:
        self._s = session

    def record(
        self,
        *,
        dagster_run_id: str,
        market_id: str,
        metrics: RunMetrics,
        provider_id: str | None = None,
        policy_id: str | None = None,
        flow_key: str | None = None,
    ) -> None:
        """UPSERT por corrida. Un reintento de la MISMA corrida ACTUALIZA: dos filas mostrarían la
        corrida duplicada en el histórico y los totales sumados dos veces."""
        existing = self._s.scalars(
            select(OrchestrationRunSnapshotModel).where(
                OrchestrationRunSnapshotModel.dagster_run_id == dagster_run_id
            )
        ).first()
        target = existing or OrchestrationRunSnapshotModel(
            dagster_run_id=dagster_run_id,
            market_id=market_id,
            provider_id=uuid.UUID(provider_id) if provider_id else None,
            policy_id=uuid.UUID(policy_id) if policy_id else None,
            flow_key=flow_key,
        )
        for field in _FIELDS:
            setattr(target, field, getattr(metrics, field))
        if existing is None:
            self._s.add(target)
        self._s.flush()

    def get(self, dagster_run_id: str) -> RunSnapshot | None:
        row = self._s.scalars(
            select(OrchestrationRunSnapshotModel).where(
                OrchestrationRunSnapshotModel.dagster_run_id == dagster_run_id
            )
        ).first()
        if row is None:
            return None
        return RunSnapshot(
            dagster_run_id=row.dagster_run_id,
            market_id=row.market_id,
            metrics=RunMetrics(**{f: getattr(row, f) for f in _FIELDS}),
            provider_id=str(row.provider_id) if row.provider_id else None,
            policy_id=str(row.policy_id) if row.policy_id else None,
            flow_key=row.flow_key,
            new_canonicals=self._count_new_canonicals(dagster_run_id),
        )

    def _count_new_canonicals(self, dagster_run_id: str) -> int:
        """DERIVADO, no almacenado. La corrida no crea canónicos —los crea un humano resolviendo su
        cola, quizá días después—, así que un número congelado al terminar la corrida diría siempre
        cero (ver #4.3). Se cuenta por atribución; el índice `ix_canonical_product_origin_run` lo
        hace un lookup."""
        return self._s.scalar(
            select(func.count())
            .select_from(CanonicalProductModel)
            .where(CanonicalProductModel.origin_run_id == dagster_run_id)
        ) or 0
