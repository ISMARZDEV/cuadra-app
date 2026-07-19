"""Unit — AdminAuditEntry (T2, auditoría admin reusable). PURO (ADR 31).

Registro append-only de una mutación del admin: quién (actor), qué (action), sobre qué
(target_type/target_id), con un resumen del cambio (payload_summary), cuándo (created_at).
"""
from __future__ import annotations

from datetime import UTC, datetime

import pytest

from src.contexts.save.domain.admin_audit import AdminAuditEntry


def test_new_generates_id_and_timestamp() -> None:
    entry = AdminAuditEntry.new(
        actor_user_id="user-1",
        action="provider.create",
        target_type="provider",
        target_id="prov-9",
        payload_summary={"name": "Bravo", "platform": "REST_CATALOG"},
        market_id="DO",
    )
    assert entry.id  # UUID asignado por el dominio
    assert entry.actor_user_id == "user-1"
    assert entry.action == "provider.create"
    assert entry.target_type == "provider"
    assert entry.target_id == "prov-9"
    assert entry.payload_summary == {"name": "Bravo", "platform": "REST_CATALOG"}
    assert entry.market_id == "DO"
    assert entry.created_at.tzinfo is not None  # timezone-aware


def test_new_accepts_explicit_clock() -> None:
    fixed = datetime(2026, 7, 18, 12, 0, tzinfo=UTC)
    entry = AdminAuditEntry.new(
        actor_user_id="u", action="source.pause", target_type="source", target_id="s1",
        payload_summary={}, market_id="DO", now=fixed,
    )
    assert entry.created_at == fixed


def test_actor_is_required() -> None:
    with pytest.raises(ValueError, match="actor_user_id"):
        AdminAuditEntry.new(
            actor_user_id="  ", action="x", target_type="t", target_id="1",
            payload_summary={}, market_id="DO",
        )


def test_action_is_required() -> None:
    with pytest.raises(ValueError, match="action"):
        AdminAuditEntry.new(
            actor_user_id="u", action="", target_type="t", target_id="1",
            payload_summary={}, market_id="DO",
        )
