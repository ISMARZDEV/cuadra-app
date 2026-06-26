"""Composition root — cablea puertos (domain/interfaces) → adaptadores (infrastructure).

Único lugar donde se conoce la implementación concreta de cada puerto. Los controllers
reciben los application services ya cableados (DI). Se llena por fase, contexto a contexto.
"""
from __future__ import annotations

# TODO (Fase 1+): registrar repos SQLAlchemy + application services por contexto.
