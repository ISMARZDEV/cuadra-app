"""`StoreRegistry` — config de fuente de extracción por Provider (1:1), PURO (ADR 31).

Reemplaza el wiring hardcodeado en `ingestion/save/sources.py::build_sources` (F2·B1/B3, Batch 3B).
`enabled`/`paused_at` son el gate MANUAL de un admin (pause/resume, server-side); la detección
automática de rotura de esquema (auto-pause) es un concern futuro de la Fase 3E — no se
implementa acá. `health_status` es de solo-lectura desde este batch (lo escribe 3E).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .provider import SourcePlatform


@dataclass(frozen=True, slots=True)
class StoreRegistry:
    id: str
    provider_id: str
    platform: SourcePlatform
    base_url: str
    endpoints: dict | None = None
    headers: dict | None = None
    auth: dict | None = None
    enabled: bool = True
    health_status: str | None = None
    paused_at: datetime | None = None

    def __post_init__(self) -> None:
        if not self.provider_id.strip():
            raise ValueError("StoreRegistry.provider_id es obligatorio (1:1 con Provider)")
        if not self.base_url.strip():
            raise ValueError("StoreRegistry.base_url es obligatorio")
