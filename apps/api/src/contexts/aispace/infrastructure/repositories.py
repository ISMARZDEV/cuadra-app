"""Implementación SQLAlchemy del puerto de preferencias de aispace (infra · ADR 31).

La **`Session` ES el Unit of Work** (commit/rollback lo maneja quien la crea). `get_personality`
devuelve el default (COACH) cuando no hay fila; `set_personality` hace upsert (get-or-create).
Misma forma para `*_extra_currencies` — la validación de negocio (máx 3, moneda activa) vive
AQUÍ, no en el modelo (infra pura, ADR 31) ni en el controller (que solo mapea 422).
"""
from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from src.contexts.aispace.preferences.enums import DEFAULT_PERSONALITY, Personality
from src.contexts.aispace.preferences.errors import (
    TooManyCurrenciesError,
    UnsupportedCurrencyError,
)
from src.shared.money import ACTIVE_CURRENCIES

from .models import UserPreferenceModel

_MAX_EXTRA_CURRENCIES = 3


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

    def get_extra_currencies(self, user_id: str) -> list[str]:
        model = self._session.get(UserPreferenceModel, uuid.UUID(user_id))
        return list(model.currency_extra) if model is not None else []

    def set_extra_currencies(self, user_id: str, currencies: list[str]) -> None:
        # Normaliza (upper) + dedupea preservando orden, ANTES de contar — "usd","USD" es 1, no 2.
        normalized: list[str] = []
        for raw in currencies:
            code = raw.strip().upper()
            if code not in normalized:
                normalized.append(code)
        if len(normalized) > _MAX_EXTRA_CURRENCIES:
            raise TooManyCurrenciesError(len(normalized))
        for code in normalized:
            if code not in ACTIVE_CURRENCIES:
                raise UnsupportedCurrencyError(code)

        model = self._session.get(UserPreferenceModel, uuid.UUID(user_id))
        if model is None:
            self._session.add(
                UserPreferenceModel(user_id=uuid.UUID(user_id), currency_extra=normalized)
            )
        else:
            model.currency_extra = normalized
        self._session.flush()
