"""Composition root — DI: cablea puertos → adaptadores y arma los use cases (ADR 24).

Único lugar que conoce las implementaciones concretas. Los controllers reciben los
use cases ya cableados vía `Depends`. La `Session` (`get_session`) es el Unit of Work
(commit al éxito, rollback al error) y se inyecta por request.
"""
from __future__ import annotations

from collections.abc import Iterator

from fastapi import Depends
from sqlalchemy.orm import Session

from src.contexts.identity.application.queries import GetMe
from src.contexts.identity.infrastructure.repositories import (
    SqlCapabilityGatingRepository,
    SqlUserRepository,
)
from src.shared.db.base import SessionLocal


def get_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_get_me(session: Session = Depends(get_session)) -> GetMe:
    return GetMe(SqlUserRepository(session), SqlCapabilityGatingRepository(session))
