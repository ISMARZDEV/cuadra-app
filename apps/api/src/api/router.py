"""Router raíz de la API v1 (ADR 24). Agrega los controllers por contexto.

A medida que cada contexto exponga endpoints, se incluyen aquí:
    api_router.include_router(insights.router, prefix="/insights", tags=["insights"])
"""
from __future__ import annotations

from fastapi import APIRouter

from src.api.v1.controllers import health

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
