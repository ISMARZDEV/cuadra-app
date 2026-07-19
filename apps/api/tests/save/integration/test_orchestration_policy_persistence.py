"""Integration — el índice único PARCIAL de `orchestration_policy` (F4 #4.2).

No alcanza con que la migración aplique: lo que hay que probar es el COMPORTAMIENTO del
`WHERE deleted_at IS NULL`. Sin el WHERE, retirar una policy y crear su reemplazo sería imposible
sin hard-delete — justo lo que §5.3 prohíbe en entidades operativas.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy.exc import IntegrityError

from src.contexts.save.infrastructure.models import OrchestrationPolicyModel, ProviderModel


def _provider(db_session) -> ProviderModel:  # type: ignore[no-untyped-def]
    provider = ProviderModel(
        id=uuid.uuid4(),
        name=f"Súper {uuid.uuid4().hex[:6]}",
        type="super",
        platform="vtex",
        market_id="DO",
    )
    db_session.add(provider)
    db_session.flush()
    return provider


def _policy(provider_id: uuid.UUID, **overrides) -> OrchestrationPolicyModel:  # type: ignore[no-untyped-def]
    return OrchestrationPolicyModel(
        scope="provider_flow",
        market_id="DO",
        provider_id=provider_id,
        flow_key="provider_prices_refresh",
        execution_mode="manual",
        timezone="America/Santo_Domingo",
        **overrides,
    )


def test_two_active_policies_for_the_same_provider_flow_are_rejected(db_session) -> None:  # type: ignore[no-untyped-def]
    provider = _provider(db_session)
    db_session.add(_policy(provider.id))
    db_session.flush()

    db_session.add(_policy(provider.id))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_a_soft_deleted_policy_does_not_block_its_replacement(db_session) -> None:  # type: ignore[no-untyped-def]
    """El caso que justifica el índice PARCIAL: el operador retira una policy (soft-delete) y crea
    una nueva para el mismo provider-flow. Con un único total, esto sería IntegrityError y la única
    salida sería borrar la fila de verdad — perdiendo la trazabilidad."""
    provider = _provider(db_session)
    retired = _policy(provider.id, deleted_at=datetime.now(UTC))
    db_session.add(retired)
    db_session.flush()

    db_session.add(_policy(provider.id))
    db_session.flush()  # no debe romper

    surviving = db_session.query(OrchestrationPolicyModel).filter_by(provider_id=provider.id).all()
    assert len(surviving) == 2, "la policy retirada debe seguir existiendo (histórico sagrado)"
    assert sum(1 for p in surviving if p.deleted_at is None) == 1
