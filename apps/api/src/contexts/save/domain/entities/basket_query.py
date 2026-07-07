"""`BasketQuery` — una query de la canasta curada, PURO (ADR 31).

Reemplaza `BASKET_QUERIES` hardcodeado en `ingestion/save/sources.py` (F2·B1/B3, Batch 3D). La
canasta la mantiene ahora un admin desde la consola (`ADMIN_SAVE_INGESTION_OPS`), no un deploy de
código; el backfill de las 213 queries curadas vive en la migración de este batch.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class BasketQuery:
    id: str
    market_id: str
    query_text: str
    category_label: str | None = None
    position: int = 0
    active: bool = True

    def __post_init__(self) -> None:
        if not self.market_id.strip():
            raise ValueError("BasketQuery.market_id es obligatorio")
        if not self.query_text.strip():
            raise ValueError("BasketQuery.query_text es obligatorio")
