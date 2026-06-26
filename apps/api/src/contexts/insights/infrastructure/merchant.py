"""Resolución get-or-create de comercios (normalización §5.6). Reusado por transaction
y recurring_rule para no repetir nombre/logo entre filas.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.contexts.insights.domain.entities import Merchant

from .models import MerchantModel


def get_or_create_merchant(
    session: Session, user_id: str, merchant: Merchant | None
) -> uuid.UUID | None:
    if merchant is None:
        return None
    existing = session.scalars(
        select(MerchantModel).where(
            MerchantModel.user_id == uuid.UUID(user_id),
            MerchantModel.name == merchant.name,
        )
    ).first()
    if existing is not None:
        return existing.id
    model = MerchantModel(
        user_id=uuid.UUID(user_id), name=merchant.name, logo_url=merchant.logo_url
    )
    session.add(model)
    session.flush()
    return model.id
