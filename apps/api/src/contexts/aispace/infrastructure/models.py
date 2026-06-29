"""SQLAlchemy models de aispace — schema 'aispace' (ADR 33). Solo infraestructura (ADR 31).

`user_preference` guarda la personalidad elegida del copiloto. `user_id` referencia al usuario
de identity POR ID, SIN FK cross-context (misma convención que `capability_market.market_id`).
Sin fila para un usuario → el repo devuelve el default (COACH); no se siembra al crear el user.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.shared.db.base import Base

_SCHEMA = "aispace"


class UserPreferenceModel(Base):
    __tablename__ = "user_preference"
    __table_args__ = {"schema": _SCHEMA}

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    personality: Mapped[str] = mapped_column(Text, nullable=False, server_default="coach")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
