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
from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy import Float, cast, func, select
from sqlalchemy.orm import Session

from ....domain.entities import MatchCandidate, MatchCandidateSnapshot, ProductMatch
from ....domain.review_queue import ReviewCandidateView, ReviewQueueRow
from ...models import (
    CanonicalProductModel,
    ProductMatchModel,
    ProviderModel,
    ReviewCandidateModel,
    StoreProductModel,
)
from ..cascade.banding import MATCH_HIGH_THRESHOLD, MATCH_MID_THRESHOLD


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
        judge_input_tokens: int | None = None,
        judge_output_tokens: int | None = None,
        judge_model: str | None = None,
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
            # F2·B1 (1.14): costo del juez — solo se pisa cuando el caller lo trae (grey/llm);
            # un reintento sin judge no debe borrar el costo ya registrado.
            if judge_input_tokens is not None:
                existing.judge_input_tokens = judge_input_tokens
            if judge_output_tokens is not None:
                existing.judge_output_tokens = judge_output_tokens
            if judge_model is not None:
                existing.judge_model = judge_model
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
            judge_input_tokens=judge_input_tokens,
            judge_output_tokens=judge_output_tokens,
            judge_model=judge_model,
        )
        self._s.add(m)
        self._s.flush()
        return str(m.id)

    def record_candidates(
        self, match_id: str, candidates: Sequence[MatchCandidateSnapshot]
    ) -> None:
        if not candidates:
            return
        mid = _parse_uuid(match_id)
        if mid is None:
            return
        # cap top-5 EN CÓDIGO, por score crudo descendente (nunca el score fusionado por RRF).
        top5 = sorted(candidates, key=lambda c: c.score, reverse=True)[:5]
        for candidate in top5:
            self._s.add(
                ReviewCandidateModel(
                    product_match_id=mid,
                    canonical_product_id=uuid.UUID(candidate.canonical_product_id),
                    name=candidate.name,
                    brand=candidate.brand,
                    score=candidate.score,  # type: ignore[arg-type]
                )
            )
        self._s.flush()

    def find_candidates_by_ean(self, ean: str, market_id: str) -> list[MatchCandidate]:
        # canonical_products DISTINTOS ya enlazados que comparten este EAN en el mercado
        # (vía store_product -> provider, product_match no tiene market_id propio). Score fijo 1.0
        # (EAN exacto, no aproximado). >1 fila = colisión ambigua; la cascada decide qué hacer.
        rows = self._s.execute(
            select(StoreProductModel.canonical_product_id)
            .join(ProviderModel, StoreProductModel.provider_id == ProviderModel.id)
            .where(
                ProviderModel.market_id == market_id,
                StoreProductModel.ean == ean,
                StoreProductModel.canonical_product_id.is_not(None),
            )
            .distinct()
        ).all()
        return [
            MatchCandidate(canonical_product_id=str(r.canonical_product_id), score=1.0)
            for r in rows
        ]

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

    def list_review_queue(
        self,
        market_id: str,
        *,
        provider_id: str | None = None,
        method: str | None = None,
        confidence_min: float | None = None,
        confidence_max: float | None = None,
        order_by: str = "uncertainty",
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[ReviewQueueRow], int]:
        # product_match no tiene market_id propio: se filtra vía store_product -> provider.
        conditions = [
            ProviderModel.market_id == market_id,
            ProductMatchModel.status == "pending_review",
        ]
        if provider_id:
            conditions.append(ProviderModel.id == uuid.UUID(provider_id))
        if method:
            conditions.append(ProductMatchModel.method == method)
        if confidence_min is not None:
            conditions.append(ProductMatchModel.confidence >= confidence_min)
        if confidence_max is not None:
            conditions.append(ProductMatchModel.confidence <= confidence_max)

        count_stmt = (
            select(func.count(ProductMatchModel.id))
            .select_from(ProductMatchModel)
            .join(StoreProductModel, ProductMatchModel.store_product_id == StoreProductModel.id)
            .join(ProviderModel, StoreProductModel.provider_id == ProviderModel.id)
            .where(*conditions)
        )
        total = self._s.scalar(count_stmt) or 0

        # Cuenta de candidatos correlacionada (subquery escalar) — evita N+1 en la UI.
        candidate_count = (
            select(func.count(ReviewCandidateModel.id))
            .where(ReviewCandidateModel.product_match_id == ProductMatchModel.id)
            .correlate(ProductMatchModel)
            .scalar_subquery()
        )
        stmt = (
            select(
                ProductMatchModel,
                StoreProductModel,
                ProviderModel.id,
                ProviderModel.name,
                candidate_count,
            )
            .join(StoreProductModel, ProductMatchModel.store_product_id == StoreProductModel.id)
            .join(ProviderModel, StoreProductModel.provider_id == ProviderModel.id)
            .where(*conditions)
        )
        if order_by == "created_at":
            stmt = stmt.order_by(ProductMatchModel.created_at.asc())
        else:
            # Uncertainty-first (default): distancia al umbral de decisión más cercano
            # (HIGH=0.85 o MID=0.55, `banding.py`) — los casos más difíciles de decidir van
            # primero. `cast(..., Float)` evita el mismatch numeric/double precision de Postgres
            # al restar contra los umbrales (floats de Python).
            confidence = cast(ProductMatchModel.confidence, Float)
            uncertainty = func.least(
                func.abs(confidence - MATCH_HIGH_THRESHOLD),
                func.abs(confidence - MATCH_MID_THRESHOLD),
            )
            stmt = stmt.order_by(uncertainty.asc())

        rows = self._s.execute(stmt.limit(limit).offset(offset)).all()
        result = [
            ReviewQueueRow(
                match_id=str(m.id),
                store_product_id=str(sp.id),
                confidence=float(m.confidence),
                method=m.method,
                provider_id=str(pid),
                provider_name=pname,
                store_product_name=sp.name,
                store_product_brand=sp.brand,
                store_product_size_text=sp.size_text,
                candidate_count=int(ccount or 0),
                created_at=m.created_at,
            )
            for m, sp, pid, pname, ccount in rows
        ]
        return result, int(total)

    def list_candidates(self, match_id: str) -> list[ReviewCandidateView]:
        mid = _parse_uuid(match_id)
        if mid is None:
            return []
        rows = self._s.scalars(
            select(ReviewCandidateModel)
            .where(ReviewCandidateModel.product_match_id == mid)
            .order_by(ReviewCandidateModel.score.desc())
        ).all()
        return [
            ReviewCandidateView(
                canonical_product_id=str(r.canonical_product_id),
                name=r.name,
                brand=r.brand,
                score=float(r.score),
            )
            for r in rows
        ]

    def get_by_id(self, match_id: str) -> ProductMatch | None:
        mid = _parse_uuid(match_id)
        m = self._s.get(ProductMatchModel, mid) if mid else None
        return _to_entity(m) if m is not None else None

    def resolve_review(
        self,
        match_id: str,
        canonical_product_id: str | None,
        decided_by: str,
        *,
        reason_code: str | None = None,
        reason_note: str | None = None,
    ) -> None:
        mid = _parse_uuid(match_id)
        m = self._s.get(ProductMatchModel, mid) if mid else None
        if m is None:
            return
        m.canonical_product_id = (
            uuid.UUID(canonical_product_id) if canonical_product_id else None
        )
        m.status = "auto_linked" if canonical_product_id else "rejected"
        m.method = "human"  # F2·B1: la decisión humana SIEMPRE sobrescribe el method de la cascada
        m.decided_by = decided_by
        m.decided_at = datetime.now(timezone.utc)
        if reason_code is not None:
            m.reason_code = reason_code
        if reason_note is not None:
            m.reason_note = reason_note
        self._s.flush()
