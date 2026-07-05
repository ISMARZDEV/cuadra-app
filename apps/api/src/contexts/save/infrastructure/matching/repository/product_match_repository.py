"""`SqlProductMatchRepository` — impl. SQLAlchemy del puerto `ProductMatchRepository` (ADR 31).

Es I/O puro: NO invoca BGE-M3 ni el judge de Claude — `find_candidates_vector` RECIBE un
embedding ya calculado (lo produce `EmbeddingProvider`, Batch 5). Mapea siempre a entidades de
dominio (`ProductMatch`/`MatchCandidate`), nunca filas ORM, en el borde infra→dominio.

`record_match` upsertea por `store_product_id` (UNIQUE en la tabla): si ya existe un intento de
enlace para ese store_product, lo ACTUALIZA en vez de duplicar — así el caso de uso de la
cascada (Batch 7) puede reintentar/reclasificar un mismo store_product de forma idempotente.
No hace commit (la `Session` es el Unit of Work — igual que el resto de `infrastructure/repositories.py`);
el caso de uso decide cuándo confirmar la transacción que además escribe
`store_product.canonical_product_id` (invariante de aplicación, ver design).

Candidate search: `find_candidates_trgm` usa el operador `%` de pg_trgm (aprovecha el índice GIN
creado en la migración 614e370d452c) + `similarity()` para el score. `find_candidates_vector` usa
`cosine_distance` de pgvector (índice HNSW) y expone `score = 1 - distance` (similitud coseno,
mayor-es-mejor) para que ambos stages compartan la misma semántica de score aunque no sean
comparables entre sí (la fusión RRF, Batch 3, opera sobre RANKS, no sobre este valor).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ....domain.entities import MatchCandidate, ProductMatch
from ...models import CanonicalProductModel, ProductMatchModel, ProviderModel, StoreProductModel


def _parse_uuid(value: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


def _to_entity(m: ProductMatchModel) -> ProductMatch:
    return ProductMatch(
        store_product_id=str(m.store_product_id),
        canonical_product_id=str(m.canonical_product_id) if m.canonical_product_id else None,
        confidence=float(m.confidence),
        method=m.method,  # type: ignore[arg-type]
        status=m.status,  # type: ignore[arg-type]
    )


class SqlProductMatchRepository:
    def __init__(self, session: Session) -> None:
        self._s = session

    def record_match(
        self,
        *,
        store_product_id: str,
        canonical_product_id: str | None,
        confidence: float,
        method: str,
        status: str,
    ) -> str:
        existing = self._s.scalars(
            select(ProductMatchModel).where(
                ProductMatchModel.store_product_id == uuid.UUID(store_product_id)
            )
        ).first()
        if existing is not None:  # upsert: la cascada reintenta/reclasifica el mismo store_product
            existing.canonical_product_id = (
                uuid.UUID(canonical_product_id) if canonical_product_id else None
            )
            existing.confidence = confidence  # type: ignore[assignment]
            existing.method = method
            existing.status = status
            self._s.flush()
            return str(existing.id)

        m = ProductMatchModel(
            store_product_id=uuid.UUID(store_product_id),
            canonical_product_id=(
                uuid.UUID(canonical_product_id) if canonical_product_id else None
            ),
            confidence=confidence,  # type: ignore[arg-type]
            method=method,
            status=status,
        )
        self._s.add(m)
        self._s.flush()
        return str(m.id)

    def find_candidates_trgm(
        self, name: str, market_id: str, limit: int = 20
    ) -> list[MatchCandidate]:
        score = func.similarity(CanonicalProductModel.name, name).label("score")
        rows = self._s.execute(
            select(CanonicalProductModel.id, score)
            .where(
                CanonicalProductModel.market_id == market_id,
                CanonicalProductModel.name.op("%")(name),  # usa el índice GIN trgm
            )
            .order_by(score.desc())
            .limit(limit)
        ).all()
        return [MatchCandidate(canonical_product_id=str(r.id), score=float(r.score)) for r in rows]

    def find_candidates_vector(
        self, embedding: list[float], market_id: str, limit: int = 20
    ) -> list[MatchCandidate]:
        distance = CanonicalProductModel.embedding.cosine_distance(embedding).label("distance")
        rows = self._s.execute(
            select(CanonicalProductModel.id, distance)
            .where(
                CanonicalProductModel.market_id == market_id,
                CanonicalProductModel.embedding.is_not(None),
            )
            .order_by(distance)  # ascendente: menor distancia = más cercano (usa el índice HNSW)
            .limit(limit)
        ).all()
        return [
            MatchCandidate(canonical_product_id=str(r.id), score=1.0 - float(r.distance))
            for r in rows
        ]

    def list_review_queue(self, market_id: str) -> list[ProductMatch]:
        # product_match no tiene market_id propio: se filtra vía store_product -> provider.
        rows = self._s.scalars(
            select(ProductMatchModel)
            .join(StoreProductModel, ProductMatchModel.store_product_id == StoreProductModel.id)
            .join(ProviderModel, StoreProductModel.provider_id == ProviderModel.id)
            .where(
                ProviderModel.market_id == market_id,
                ProductMatchModel.status == "pending_review",
            )
        ).all()
        return [_to_entity(m) for m in rows]

    def resolve_review(
        self, match_id: str, canonical_product_id: str | None, decided_by: str
    ) -> None:
        mid = _parse_uuid(match_id)
        m = self._s.get(ProductMatchModel, mid) if mid else None
        if m is None:
            return
        m.canonical_product_id = (
            uuid.UUID(canonical_product_id) if canonical_product_id else None
        )
        m.status = "auto_linked" if canonical_product_id else "rejected"
        m.decided_by = decided_by
        m.decided_at = datetime.now(timezone.utc)
        self._s.flush()
