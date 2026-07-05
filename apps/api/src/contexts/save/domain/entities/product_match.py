"""`ProductMatch` — PURO (ADR 31). Fuente de verdad del enlace store_product↔canonical_product.

Cada fila registra el intento de enlace de UN `store_product` (UNIQUE), con el método que lo
produjo (cascada EAN→trgm→vector→llm, o `human` para revisión manual) y su estado. Mientras
`status == "pending_review"`, `canonical_product_id` puede ser `None` (aún sin candidato
confirmado). El escritor de `store_product.canonical_product_id` (denormalizado, solo lectura
rápida) vive en la capa de aplicación, NUNCA aquí — este dataclass no conoce infraestructura.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

MatchMethod = Literal["ean", "trgm", "vector", "hybrid", "llm", "human"]
MatchStatus = Literal["auto_linked", "pending_review", "rejected"]

_VALID_METHODS: frozenset[str] = frozenset({"ean", "trgm", "vector", "hybrid", "llm", "human"})
_VALID_STATUSES: frozenset[str] = frozenset({"auto_linked", "pending_review", "rejected"})


@dataclass(frozen=True, slots=True)
class ProductMatch:
    store_product_id: str
    canonical_product_id: str | None
    confidence: float
    method: MatchMethod
    status: MatchStatus

    def __post_init__(self) -> None:
        if not self.store_product_id.strip():
            raise ValueError("ProductMatch.store_product_id no puede estar vacío")
        if self.method not in _VALID_METHODS:
            raise ValueError(f"ProductMatch.method inválido: {self.method!r}")
        if self.status not in _VALID_STATUSES:
            raise ValueError(f"ProductMatch.status inválido: {self.status!r}")
        if not isinstance(self.confidence, float):
            raise ValueError("ProductMatch.confidence debe ser float")
        if not (0.0 <= self.confidence <= 1.0):
            raise ValueError(
                f"ProductMatch.confidence fuera de rango [0.0, 1.0]: {self.confidence!r}"
            )


@dataclass(frozen=True, slots=True)
class MatchCandidate:
    """Candidato a canonical_product devuelto por una etapa de búsqueda (trgm/vector).

    `score` es la métrica CRUDA de la etapa que lo produjo (similitud trgm o distancia/similitud
    coseno) — no comparable entre etapas; la fusión (RRF, Batch 3) opera sobre RANKS, no sobre
    este valor directamente.
    """

    canonical_product_id: str
    score: float
