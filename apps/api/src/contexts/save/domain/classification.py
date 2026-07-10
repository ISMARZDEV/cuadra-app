"""Modelo de dominio de la clasificación de categoría (save-category-classification). PURO (ADR 31).

- `ClassifiableProduct`: input a la cascada (nombre/marca/tamaño de un store o canonical product).
- `CategoryCandidate`: una hoja candidata rankeada por una etapa (trgm/vector).
- `ClassificationResult`: salida de la cascada antes de persistir (hoja + confianza + método + banda).
- `CategoryClassification`: el registro persistente (fila `active` de `category_classification`).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ClassifiableProduct:
    ref_id: str  # store_product_id o canonical_product_id
    is_canonical: bool
    name: str
    brand: str = ""
    size_text: str = ""


@dataclass(frozen=True, slots=True)
class CategoryCandidate:
    taxonomy_node_id: str
    score: float
    source: str  # "trgm" | "vector"


@dataclass(frozen=True, slots=True)
class ClassificationResult:
    taxonomy_node_id: str | None  # la HOJA asignada; None = sin clasificar
    confidence: float
    method: str  # lexicon|trgm|vector|hybrid|llm|human|none
    band: str  # auto|grey|human


@dataclass(frozen=True, slots=True)
class CategoryClassification:
    id: str
    store_product_id: str | None
    canonical_product_id: str | None
    taxonomy_node_id: str
    confidence: float
    method: str
    status: str  # active|superseded|rejected
