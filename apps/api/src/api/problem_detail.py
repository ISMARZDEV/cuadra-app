"""Problem Detail (RFC 7807-ish) — formato de error consistente de la API."""
from __future__ import annotations

from pydantic import BaseModel


class ProblemDetailDto(BaseModel):
    title: str
    status: int
    detail: str | None = None
