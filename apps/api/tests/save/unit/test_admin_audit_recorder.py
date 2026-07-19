"""Unit — AdminAuditRecorder (T2). El servicio de borde que audita mutaciones del admin: lleva el
actor dentro (del request) y arma+persiste la entrada. Fakes, sin DB."""
from __future__ import annotations

from src.contexts.save.application.admin_audit_recorder import AdminAuditRecorder
from src.contexts.save.domain.admin_audit import AdminAuditEntry


class _FakeAudit:
    def __init__(self) -> None:
        self.recorded: list[AdminAuditEntry] = []

    def record(self, entry: AdminAuditEntry) -> None:
        self.recorded.append(entry)

    def list_recent(self, **kw):  # type: ignore[no-untyped-def]
        return list(self.recorded)


def test_records_with_the_bound_actor() -> None:
    repo = _FakeAudit()
    rec = AdminAuditRecorder(repo, actor_user_id="user-7")

    rec.record("provider.create", "provider", "p1", {"name": "Bravo"})

    assert len(repo.recorded) == 1
    e = repo.recorded[0]
    assert e.actor_user_id == "user-7"
    assert e.action == "provider.create"
    assert e.target_type == "provider"
    assert e.target_id == "p1"
    assert e.payload_summary == {"name": "Bravo"}


def test_payload_defaults_to_empty() -> None:
    repo = _FakeAudit()
    AdminAuditRecorder(repo, actor_user_id="u").record("source.pause", "source", "s1")
    assert repo.recorded[0].payload_summary == {}


def test_market_id_is_threaded() -> None:
    repo = _FakeAudit()
    AdminAuditRecorder(repo, actor_user_id="u").record(
        "basket.delete", "basket_query", "b1", market_id="US"
    )
    assert repo.recorded[0].market_id == "US"
