"""Observabilidad (ADR 28) — activa LangSmith tracing por entorno.

LangChain/LangGraph se auto-instrumentan SOLO si encuentran las vars en `os.environ`
(`LANGSMITH_TRACING`, `LANGSMITH_API_KEY`). pydantic-settings lee `.env` hacia el objeto
Settings, NO hacia el entorno del proceso, así que aquí las exportamos explícitamente cuando
el tracing está activado. `create_app()` lo llama en el arranque, ANTES de que se construya el
grafo (lazy, en el primer request de aispace), de modo que LangChain ya las ve.
"""
from __future__ import annotations

import os

from src.config import Settings


def configure_langsmith(settings: Settings) -> bool:
    """Exporta las vars de LangSmith a os.environ si el tracing está activo y hay key.

    Devuelve True si quedó activado. Usa `setdefault` para no pisar un entorno ya configurado
    (p. ej. uno inyectado por el contenedor o un override explícito).
    """
    if not (settings.langsmith_tracing and settings.langsmith_api_key):
        return False

    os.environ.setdefault("LANGSMITH_TRACING", "true")
    os.environ.setdefault("LANGSMITH_API_KEY", settings.langsmith_api_key)
    if settings.langsmith_project:
        os.environ.setdefault("LANGSMITH_PROJECT", settings.langsmith_project)
    return True
