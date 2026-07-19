"""Integration — el seed de identity es idempotente (correr 2 veces no duplica ni falla)."""
from __future__ import annotations

from sqlalchemy import func, select

from seeds.identity_seed import seed_identity
from src.contexts.identity.domain.enums import CapabilityKey
from src.contexts.identity.infrastructure.models import (
    CapabilityModel,
    RoleCapabilityModel,
    RoleModel,
)


def test_seed_is_idempotent(db_session) -> None:  # type: ignore[no-untyped-def]
    seed_identity(db_session)
    seed_identity(db_session)  # 2ª vez: no debe duplicar ni romper
    db_session.flush()

    assert db_session.get(RoleModel, "normal_user") is not None
    assert db_session.get(RoleModel, "super_admin") is not None
    caps = db_session.scalar(select(func.count()).select_from(CapabilityModel))
    assert caps == len(CapabilityKey)


def test_super_admin_gets_orchestration_ops(db_session) -> None:  # type: ignore[no-untyped-def]
    """F4·4.1 — la consola de Orquestación tiene capability PROPIA, no reusa
    `admin_save_ingestion_ops`: cancelar/reintentar/programar corridas es más sensible que
    editar un provider (SDD §7).

    Re-seedear DEBE otorgarla a un `super_admin` que ya existía. Es la trampa OPS #1 de
    `docs/pending/save-admin-review-pendientes.md`: `seed_identity` usa `on_conflict_do_nothing`,
    así que un entorno sembrado ANTES de F4 se queda sin la fila y el admin come 403 sin que
    nada falle ruidosamente.
    """
    seed_identity(db_session)
    seed_identity(db_session)  # simula el entorno ya sembrado que se re-siembra
    db_session.flush()

    granted = db_session.scalars(
        select(RoleCapabilityModel.capability_key).where(
            RoleCapabilityModel.role_key == "super_admin"
        )
    ).all()
    assert CapabilityKey.ADMIN_SAVE_ORCHESTRATION_OPS.value in granted
