"""FastAPI app factory. Punto de entrada del backend.

`src/api/composition_root.py` cablea los puertos → adaptadores por contexto (DI).
Por ahora solo monta el router con /v1/health (esqueleto corrible, sin lógica).
"""
from __future__ import annotations

from fastapi import FastAPI

from src.api.router import api_router
from src.config import settings


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, version="0.1.0")
    app.include_router(api_router, prefix="/v1")
    return app


app = create_app()
