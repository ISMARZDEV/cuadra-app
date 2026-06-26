"""Health check — endpoint mínimo para verificar que el backend levanta."""
from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "cuadra-api", "version": "0.1.0"}
