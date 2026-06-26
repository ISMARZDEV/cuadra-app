"""Unit — CapabilityResolver: unión aditiva + gating por mercado (ADR 4). Lógica pura."""
from __future__ import annotations

from src.contexts.identity.domain.entities import Role
from src.contexts.identity.domain.enums import CapabilityKey, RoleKey
from src.contexts.identity.domain.services import CapabilityResolver

NORMAL = Role(
    key=RoleKey.NORMAL_USER,
    capabilities=frozenset({CapabilityKey.WALLET, CapabilityKey.BUDGET, CapabilityKey.CARD}),
)
ADMIN = Role(key=RoleKey.SUPER_ADMIN, capabilities=frozenset({CapabilityKey.ADMIN_DB}))


def test_single_role_returns_its_capabilities() -> None:
    eff = CapabilityResolver.resolve([NORMAL])
    assert eff == frozenset({CapabilityKey.WALLET, CapabilityKey.BUDGET, CapabilityKey.CARD})


def test_multi_role_unions_capabilities() -> None:
    eff = CapabilityResolver.resolve([NORMAL, ADMIN])
    assert CapabilityKey.WALLET in eff
    assert CapabilityKey.ADMIN_DB in eff


def test_gating_disables_explicit_capability() -> None:
    gating = {CapabilityKey.CARD: False}  # tarjeta no habilitada en este market
    eff = CapabilityResolver.resolve([NORMAL], gating)
    assert CapabilityKey.CARD not in eff
    assert CapabilityKey.WALLET in eff  # no listada → permitida por defecto


def test_gating_none_grants_all() -> None:
    eff = CapabilityResolver.resolve([NORMAL], None)
    assert CapabilityKey.CARD in eff


def test_unlisted_capability_allowed_by_default() -> None:
    gating = {CapabilityKey.REMITTANCE: False}
    eff = CapabilityResolver.resolve([NORMAL], gating)
    assert CapabilityKey.WALLET in eff


def test_empty_roles_returns_empty() -> None:
    assert CapabilityResolver.resolve([]) == frozenset()
