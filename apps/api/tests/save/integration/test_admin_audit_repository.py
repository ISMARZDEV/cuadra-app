"""Integration — SqlAdminAuditRepository (T2). DB. Append-only + lectura de actividad reciente."""
from __future__ import annotations

import uuid

from src.contexts.save.domain.admin_audit import AdminAuditEntry
from src.contexts.save.infrastructure.repositories import SqlAdminAuditRepository


def test_record_then_list_recent_newest_first(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    repo = SqlAdminAuditRepository(db_session)

    repo.record(AdminAuditEntry.new(
        actor_user_id="u1", action="provider.create", target_type="provider",
        target_id="p1", payload_summary={"name": "Bravo"}, market_id=market))
    repo.record(AdminAuditEntry.new(
        actor_user_id="u2", action="source.pause", target_type="source",
        target_id="s1", payload_summary={}, market_id=market))
    db_session.flush()

    recent = repo.list_recent(market_id=market, limit=10)
    assert [e.action for e in recent] == ["source.pause", "provider.create"]  # newest first
    assert recent[0].actor_user_id == "u2"
    assert recent[1].payload_summary == {"name": "Bravo"}


def test_list_recent_filters_by_target(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    repo = SqlAdminAuditRepository(db_session)
    repo.record(AdminAuditEntry.new(
        actor_user_id="u", action="provider.update", target_type="provider",
        target_id="p1", payload_summary={}, market_id=market))
    repo.record(AdminAuditEntry.new(
        actor_user_id="u", action="source.create", target_type="source",
        target_id="s1", payload_summary={}, market_id=market))
    db_session.flush()

    only_p1 = repo.list_recent(market_id=market, target_type="provider", target_id="p1")
    assert [e.action for e in only_p1] == ["provider.update"]
