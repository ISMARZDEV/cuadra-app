"""`AdminAuditRecorder` — servicio de borde para auditar mutaciones del admin (T2).

La auditoría "quién hizo esta acción" es una preocupación TRANSVERSAL del borde (el actor = el
request autenticado), no lógica de dominio — por eso vive aquí y la invocan los controllers, no cada
use-case. Lleva el `actor_user_id` del request dentro y arma+persiste la `AdminAuditEntry`.

Atomicidad: el recorder comparte la `Session` del request (mismo Unit of Work que la mutación, ver
`composition_root.get_session` → commit al final del request). Si la mutación o el registro fallan,
el rollback del request descarta AMBOS — la auditoría nunca queda huérfana ni parcial.
"""
from __future__ import annotations

from typing import Any

from ..domain.admin_audit import AdminAuditEntry
from ..domain.ports import AdminAuditRepository


class AdminAuditRecorder:
    def __init__(self, audit: AdminAuditRepository, actor_user_id: str) -> None:
        self._audit = audit
        self._actor = actor_user_id

    def record(
        self,
        action: str,
        target_type: str,
        target_id: str,
        payload_summary: dict[str, Any] | None = None,
        *,
        market_id: str = "DO",
    ) -> None:
        self._audit.record(AdminAuditEntry.new(
            actor_user_id=self._actor,
            action=action,
            target_type=target_type,
            target_id=target_id,
            payload_summary=payload_summary,
            market_id=market_id,
        ))
