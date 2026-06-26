"""DTOs de identity (Pydantic) — el contrato que sale por la API. CQRS-read."""
from __future__ import annotations

from pydantic import BaseModel


class MeResponse(BaseModel):
    id: str
    email: str | None
    name: str
    locale: str
    plan: str
    home_market: str
    current_market: str
    capabilities: list[str]
