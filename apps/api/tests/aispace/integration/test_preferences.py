"""Integration — SqlPreferenceRepository: default COACH + upsert de la personalidad,
y las hasta-3 monedas EXTRA (currency-preferences · la principal se deriva de identity,
no se guarda aquí).

La preferencia es aispace (cómo te habla el copiloto / qué monedas maneja), ref. al user
por ID sin FK cross-context. Sin fila → default COACH / sin monedas extra. Se salta sin DB.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.orm import Session

from src.contexts.aispace.infrastructure.repositories import SqlPreferenceRepository
from src.contexts.aispace.preferences.enums import Personality
from src.contexts.aispace.preferences.errors import (
    TooManyCurrenciesError,
    UnsupportedCurrencyError,
)


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


def test_get_extra_currencies_defaults_to_empty_when_no_row(db_session: Session) -> None:
    repo = SqlPreferenceRepository(db_session)
    assert repo.get_extra_currencies(str(uuid.uuid4())) == []


def test_set_then_get_extra_currencies_roundtrip(db_session: Session) -> None:
    repo = SqlPreferenceRepository(db_session)
    uid = str(uuid.uuid4())
    repo.set_extra_currencies(uid, ["USD", "EUR"])
    assert repo.get_extra_currencies(uid) == ["USD", "EUR"]


def test_set_extra_currencies_is_upsert_not_duplicate(db_session: Session) -> None:
    repo = SqlPreferenceRepository(db_session)
    uid = str(uuid.uuid4())
    repo.set_extra_currencies(uid, ["USD"])
    repo.set_extra_currencies(uid, ["COP", "BRL"])
    assert repo.get_extra_currencies(uid) == ["COP", "BRL"]


def test_set_extra_currencies_normalizes_case_and_dedupes(db_session: Session) -> None:
    repo = SqlPreferenceRepository(db_session)
    uid = str(uuid.uuid4())
    repo.set_extra_currencies(uid, ["usd", "USD", "eur"])
    assert repo.get_extra_currencies(uid) == ["USD", "EUR"]


def test_set_extra_currencies_rejects_more_than_three(db_session: Session) -> None:
    repo = SqlPreferenceRepository(db_session)
    with pytest.raises(TooManyCurrenciesError):
        repo.set_extra_currencies(str(uuid.uuid4()), ["USD", "EUR", "COP", "BRL"])


def test_set_extra_currencies_rejects_inactive_currency(db_session: Session) -> None:
    repo = SqlPreferenceRepository(db_session)
    with pytest.raises(UnsupportedCurrencyError):
        repo.set_extra_currencies(str(uuid.uuid4()), ["JPY"])   # no está en ACTIVE_CURRENCIES
