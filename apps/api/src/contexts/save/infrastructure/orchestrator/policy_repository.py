"""Persistencia de `OrchestrationPolicy` (F4 #4.5)."""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from ...domain.entities.orchestration import (
    ExecutionMode,
    FlowKey,
    OrchestrationGlobalConfig,
    OrchestrationPolicy,
    PolicyScope,
)
from ..models import OrchestrationGlobalConfigModel, OrchestrationPolicyModel


def _to_entity(row: OrchestrationPolicyModel) -> OrchestrationPolicy:
    return OrchestrationPolicy(
        id=str(row.id),
        scope=PolicyScope(row.scope),
        market_id=row.market_id,
        timezone=row.timezone,
        execution_mode=ExecutionMode(row.execution_mode),
        provider_id=str(row.provider_id) if row.provider_id else None,
        flow_key=FlowKey(row.flow_key) if row.flow_key else None,
        asset_key=row.asset_key,
        cron_expression=row.cron_expression,
        sla_minutes=row.sla_minutes,
        query_limit_override=row.query_limit_override,
        priority=row.priority,
        enabled=row.enabled,
        deleted_at=row.deleted_at,
    )


class SqlOrchestrationPolicyRepository:
    def __init__(self, session: Session) -> None:
        self._s = session

    def _row(self, policy_id: str) -> OrchestrationPolicyModel | None:
        return self._s.get(OrchestrationPolicyModel, uuid.UUID(policy_id))

    def get(self, policy_id: str) -> OrchestrationPolicy | None:
        row = self._row(policy_id)
        return _to_entity(row) if row is not None else None

    def find_active(
        self, *, provider_id: str, market_id: str, flow_key: str
    ) -> OrchestrationPolicy | None:
        """Activa = no soft-deleted. `enabled=False` (pausada) SIGUE siendo activa para la
        unicidad: pausar no libera el slot, si no crear un duplicado sería tan simple como pausar
        el original y el operador terminaría con dos configuraciones para la misma tienda."""
        row = self._s.scalars(
            select(OrchestrationPolicyModel).where(
                OrchestrationPolicyModel.provider_id == uuid.UUID(provider_id),
                OrchestrationPolicyModel.market_id == market_id,
                OrchestrationPolicyModel.flow_key == flow_key,
                OrchestrationPolicyModel.deleted_at.is_(None),
            )
        ).first()
        return _to_entity(row) if row is not None else None

    def list_by_market(self, market_id: str) -> list[OrchestrationPolicy]:
        rows = self._s.scalars(
            select(OrchestrationPolicyModel)
            .where(
                OrchestrationPolicyModel.market_id == market_id,
                OrchestrationPolicyModel.deleted_at.is_(None),
            )
            .order_by(OrchestrationPolicyModel.created_at)
        ).all()
        return [_to_entity(r) for r in rows]

    def add(self, policy: OrchestrationPolicy) -> None:
        self._s.add(
            OrchestrationPolicyModel(
                id=uuid.UUID(policy.id),
                scope=policy.scope.value,
                market_id=policy.market_id,
                provider_id=uuid.UUID(policy.provider_id) if policy.provider_id else None,
                flow_key=policy.flow_key.value if policy.flow_key else None,
                asset_key=policy.asset_key,
                execution_mode=policy.execution_mode.value,
                cron_expression=policy.cron_expression,
                timezone=policy.timezone,
                sla_minutes=policy.sla_minutes,
                query_limit_override=policy.query_limit_override,
                priority=policy.priority,
                enabled=policy.enabled,
            )
        )
        self._s.flush()

    def save(self, policy: OrchestrationPolicy) -> None:
        """Persiste los campos EDITABLES. `scope`/`provider`/`flow_key` no se tocan: cambiarlos
        convertiría la policy en otra distinta y rompería la trazabilidad de sus corridas."""
        row = self._row(policy.id)
        if row is None:
            raise ValueError(f"policy inexistente: {policy.id}")
        row.execution_mode = policy.execution_mode.value
        row.cron_expression = policy.cron_expression
        row.timezone = policy.timezone
        row.sla_minutes = policy.sla_minutes
        row.query_limit_override = policy.query_limit_override
        row.priority = policy.priority
        row.enabled = policy.enabled
        row.deleted_at = policy.deleted_at
        self._s.flush()


class SqlOrchestrationGlobalConfigRepository:
    """Defaults por mercado. **Puede no haber fila**: la tabla existe desde F4 y nunca se sembró, así
    que `None` es el estado normal de hoy y no un error. El dominio ya sabe expresarlo
    (`query_limit_effective(None)` → sin tope)."""

    def __init__(self, session: Session) -> None:
        self._s = session

    def get(self, market_id: str) -> OrchestrationGlobalConfig | None:
        row = self._s.scalars(
            select(OrchestrationGlobalConfigModel).where(
                OrchestrationGlobalConfigModel.market_id == market_id
            )
        ).first()
        if row is None:
            return None
        return OrchestrationGlobalConfig(
            id=str(row.id),
            market_id=row.market_id,
            default_query_limit=row.default_query_limit,
            default_timezone=row.default_timezone,
            default_sla_minutes=row.default_sla_minutes,
            auto_runs_enabled=row.auto_runs_enabled,
        )
