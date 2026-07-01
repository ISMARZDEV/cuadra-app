"""SQLAlchemy models de aispace — schema 'aispace' (ADR 33). Solo infraestructura (ADR 31).

`user_preference` guarda la personalidad elegida del copiloto Y las hasta-3 monedas EXTRA
(currency-preferences; la PRINCIPAL se deriva de `identity.home_market`, no se guarda aquí).
`user_id` referencia al usuario de identity POR ID, SIN FK cross-context (misma convención que
`capability_market.market_id`). Sin fila para un usuario → el repo devuelve los defaults (COACH,
sin monedas extra); no se siembra al crear el user.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ARRAY, DateTime, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.shared.db.base import Base

_SCHEMA = "aispace"


class UserPreferenceModel(Base):
    __tablename__ = "user_preference"
    __table_args__ = {"schema": _SCHEMA}

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    personality: Mapped[str] = mapped_column(Text, nullable=False, server_default="coach")
    # ISO 4217 codes, máx 3, validados contra ACTIVE_CURRENCIES en el repo (no aquí — el modelo
    # es infra pura, ADR 31).
    currency_extra: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default="{}"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
