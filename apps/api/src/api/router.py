"""Router raíz de la API v1 (ADR 24). Agrega los controllers por contexto.

Convención: cada contexto monta su router con prefijo propio (`/identity`, `/insights`, …)
para que la ruta indique de qué contexto proviene.
"""
from __future__ import annotations

from fastapi import APIRouter

from src.api.v1.controllers import aispace, health, identity, insights, save

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(identity.router)
api_router.include_router(insights.router)
api_router.include_router(aispace.router)
api_router.include_router(save.router)
