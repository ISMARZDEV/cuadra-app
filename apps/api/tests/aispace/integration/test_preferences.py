"""Integration — SqlPreferenceRepository: default COACH + upsert de la personalidad.

La preferencia es aispace (cómo te habla el copiloto), ref. al user por ID sin FK cross-context.
Sin fila → default COACH (el usuario nuevo arranca con carácter, sin elegir). Se salta sin DB.
"""
from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from src.contexts.aispace.infrastructure.repositories import SqlPreferenceRepository
from src.contexts.aispace.preferences.enums import Personality


def test_get_personality_defaults_to_coach_when_no_row(db_session: Session) -> None:
    repo = SqlPreferenceRepository(db_session)
    assert repo.get_personality(str(uuid.uuid4())) == Personality.COACH


def test_set_then_get_roundtrip(db_session: Session) -> None:
    repo = SqlPreferenceRepository(db_session)
    uid = str(uuid.uuid4())
    repo.set_personality(uid, Personality.ROAST)
    assert repo.get_personality(uid) == Personality.ROAST


def test_set_is_upsert_not_duplicate(db_session: Session) -> None:
    repo = SqlPreferenceRepository(db_session)
    uid = str(uuid.uuid4())
    repo.set_personality(uid, Personality.ROAST)
    repo.set_personality(uid, Personality.NEUTRAL)   # segunda vez → actualiza, no duplica
    assert repo.get_personality(uid) == Personality.NEUTRAL
