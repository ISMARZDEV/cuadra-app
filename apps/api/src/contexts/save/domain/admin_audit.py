"""`AdminAuditEntry` — registro append-only de una mutación del admin/OFV (T2). PURO (ADR 31).

Fundación reusable de trazabilidad: TODA mutación sensible del admin (review resolve, provider/source/
basket CRUD, logo, pause…) escribe UNA fila aquí, en la MISMA transacción que la mutación. Responde
"quién cambió qué, cuándo" — imprescindible en un back-office multi-usuario con RBAC (a diferencia del
competidor, single-operator sin actor). Append-only y sagrado, como `price`/`product_match`: nunca se
edita ni se borra.

Diseño (estado del arte: tabla central, NO shadow-table por entidad ni triggers de DB): el registro
va por la capa de aplicación (hexagonal), no por triggers — el use-case es dueño de su auditoría.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any


@dataclass(frozen=True, slots=True)
class AdminAuditEntry:
    id: str
    actor_user_id: str
    action: str
    target_type: str
    target_id: str
    payload_summary: dict[str, Any] = field(default_factory=dict)
    market_id: str = "DO"
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    @classmethod
    def new(
        cls,
        *,
        actor_user_id: str,
        action: str,
        target_type: str,
        target_id: str,
        payload_summary: dict[str, Any] | None = None,
        market_id: str = "DO",
        now: datetime | None = None,
    ) -> AdminAuditEntry:
        if not actor_user_id.strip():
            raise ValueError("AdminAuditEntry.actor_user_id es obligatorio")
        if not action.strip():
            raise ValueError("AdminAuditEntry.action es obligatorio")
        return cls(
            id=str(uuid.uuid4()),
            actor_user_id=actor_user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            payload_summary=payload_summary or {},
            market_id=market_id,
            created_at=now or datetime.now(UTC),
        )
