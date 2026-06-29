"""Implementación SQLAlchemy del puerto de preferencias de aispace (infra · ADR 31).

La **`Session` ES el Unit of Work** (commit/rollback lo maneja quien la crea). `get_personality`
devuelve el default (COACH) cuando no hay fila; `set_personality` hace upsert (get-or-create).
"""
from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from src.contexts.aispace.preferences.enums import DEFAULT_PERSONALITY, Personality

from .models import UserPreferenceModel


class SqlPreferenceRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_personality(self, user_id: str) -> Personality:
        model = self._session.get(UserPreferenceModel, uuid.UUID(user_id))
        if model is None:
            return DEFAULT_PERSONALITY
        return Personality(model.personality)

    def set_personality(self, user_id: str, personality: Personality) -> None:
        model = self._session.get(UserPreferenceModel, uuid.UUID(user_id))
        if model is None:
            self._session.add(
                UserPreferenceModel(user_id=uuid.UUID(user_id), personality=personality.value)
            )
        else:
            model.personality = personality.value
        self._session.flush()
