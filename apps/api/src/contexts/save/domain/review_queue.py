"""Read models de la cola de revisión de matching (F2 · B1). PUROS (ADR 31) — igual convención
que `listing.py`/`history.py`: grain crudo que entrega el repo, sin money-math ni lógica de
decisión (eso vive en `MatchStoreProduct`/`banding.py`, sin tocar).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True, slots=True)
class ReviewQueueRow:
    """Una fila de la cola de revisión (`ListReviewQueue`) — un `product_match` `pending_review`
    con su `store_product` crudo + provider ya resueltos por el JOIN (evita N+1 en la UI)."""

    match_id: str
    store_product_id: str
    confidence: float
    method: str
    provider_id: str
    provider_name: str
    store_product_name: str | None
    store_product_brand: str | None
    store_product_size_text: str | None
    candidate_count: int
    created_at: datetime
    provider_logo_url: str | None = None
    store_product_image_url: str | None = None
    # admin-workspace (Batch 1): SIEMPRE None hasta que exista `save-category-classification`
    # (cambio de backend separado que asignará categoría vía los mecanismos del matching).
    category_slug: str | None = None
    category_name: str | None = None


@dataclass(frozen=True, slots=True)
class StoreProductRawAttrs:
    """Atributos crudos de un `store_product` (F2·B1, tarea 1.9-1.10) para el detalle de
    revisión — tal cual persistidos por `record_observation`, sin normalizar. `sku`/`ean` y la
    tienda origen (`provider_name`) se agregan para el rediseño del detalle (full-stack)."""

    store_product_id: str
    name: str | None
    brand: str | None
    size_text: str | None
    image_url: str | None
    sku: str | None = None
    ean: str | None = None
    provider_name: str | None = None
    # Etapa A (crear canónico desde el detalle): el market (por el provider) para el payload de
    # creación, y la categoría SUGERIDA = la clasificación activa del store_product (Etapa B),
    # default del selector de categoría. None si aún no está clasificado.
    market_id: str | None = None
    suggested_taxonomy_node_id: str | None = None
    suggested_category_name: str | None = None


@dataclass(frozen=True, slots=True)
class ReviewCandidateView:
    """Un candidato ofrecido al revisor (`review_candidate`), para el diff en el detalle.
    `image_url`/`size_text` se resuelven del `canonical_product` en read-time (join en
    `list_candidates`) para las cards del rediseño — el snapshot solo guarda name/brand/score."""

    canonical_product_id: str
    name: str | None
    brand: str | None
    score: float
    image_url: str | None = None
    size_text: str | None = None


@dataclass(frozen=True, slots=True)
class ReviewDetail:
    """`GetReviewDetail`: atributos crudos del store_product + candidatos ofrecidos, para el
    diff field-by-field de la UI de comparación. `candidates` vacío (nunca un error) para filas
    LEGACY sin `review_candidate` persistidos (pre-batch-1c) o EAN-colisión (que también las
    salta, ver `MatchStoreProduct._to_review` con `candidates=collision_snapshots` que SÍ las
    persiste — el caso vacío real es el legacy/pre-wiring)."""

    match_id: str
    store_product_id: str
    confidence: float
    method: str
    store_product_name: str | None
    store_product_brand: str | None
    store_product_size_text: str | None
    store_product_image_url: str | None
    store_product_sku: str | None = None
    store_product_ean: str | None = None
    provider_name: str | None = None
    # Etapa A: market + categoría sugerida (clasificación activa del store_product, Etapa B).
    market_id: str | None = None
    suggested_taxonomy_node_id: str | None = None
    suggested_category_name: str | None = None
    candidates: list[ReviewCandidateView] = field(default_factory=list)
