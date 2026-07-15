"""Seed idempotente del contexto identity (§11).

Carga la reference data: roles, capabilities, role_capability (qué capability tiene cada
rol) y el gating por mercado. **Seguro de correr N veces** (ON CONFLICT DO NOTHING).
MVP: solo roles Usuario Normal + Super Admin (§3.2).
"""
from __future__ import annotations

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from src.contexts.identity.domain.enums import CapabilityKey as C
from src.contexts.identity.domain.enums import RoleKey as R
from src.contexts.identity.infrastructure.models import (
    CapabilityMarketModel,
    CapabilityModel,
    RoleCapabilityModel,
    RoleModel,
)

_ROLES = {
    R.NORMAL_USER: "Usuario Normal",
    R.SUPER_ADMIN: "Super Admin",
}

_ROLE_CAPABILITIES = {
    R.NORMAL_USER: [
        C.WALLET, C.SAVINGS, C.BUDGET, C.SHOPPING_LIST, C.CHAT, C.NEWS_READ,
        C.CARD, C.REMITTANCE,  # extras de fase 5 — gateadas OFF en RD (abajo)
    ],
    R.SUPER_ADMIN: [
        C.ADMIN_NEWS_PUBLISH, C.ADMIN_DB, C.NEWS_READ, C.CHAT,
        C.ADMIN_SAVE_MATCHING_REVIEW, C.ADMIN_SAVE_INGESTION_OPS,  # F2·B1: consola admin de Save
    ],
}

# Gating RD (DO): tarjeta y remesas OFF hasta fase 5 (§14)
_MARKET_GATING_DO = {C.CARD: False, C.REMITTANCE: False}


def seed_identity(session: Session) -> None:
    session.execute(
        insert(CapabilityModel)
        .values([{"key": c.value} for c in C])
        .on_conflict_do_nothing()
    )
    session.execute(
        insert(RoleModel)
        .values([{"key": r.value, "name": name} for r, name in _ROLES.items()])
        .on_conflict_do_nothing()
    )
    role_caps = [
        {"role_key": role.value, "capability_key": cap.value}
        for role, caps in _ROLE_CAPABILITIES.items()
        for cap in caps
    ]
    session.execute(
        insert(RoleCapabilityModel).values(role_caps).on_conflict_do_nothing()
    )
    gating = [
        {"capability_key": cap.value, "market_id": "DO", "enabled": enabled}
        for cap, enabled in _MARKET_GATING_DO.items()
    ]
    session.execute(
        insert(CapabilityMarketModel).values(gating).on_conflict_do_nothing()
    )
