"""Admin Save controller — HTTP boundary de la consola de administración de Save (F2 · B1).

Cola de revisión de matching: listar/ver detalle/resolver (aprobar-rechazar)/crear-canónico y
enlazar/bulk-resolver. Thin (SRP, igual convención que `save.py`): parsea el request, delega en
el use case, devuelve el DTO. TODA ruta exige `require_capability(ADMIN_SAVE_MATCHING_REVIEW)` —
este es el gate real (server-side); nunca confiar en un chequeo solo-cliente (SACRED).
"""
from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from src.api.composition_root import (
    get_bulk_resolve_review,
    get_create_canonical_and_link,
    get_list_review_queue,
    get_resolve_review,
    get_review_detail,
)
from src.api.extensions.security import require_capability
from src.contexts.identity.domain.enums import CapabilityKey
from src.contexts.save.application.bulk_resolve_review import BulkResolveReview, BulkResolveRow
from src.contexts.save.application.create_canonical_and_link import (
    CreateCanonicalAndLink,
    NewCanonicalProduct,
)
from src.contexts.save.application.dtos import (
    AdminReviewDetailDto,
    AdminReviewQueueListDto,
    BulkResolveResultDto,
)
from src.contexts.save.application.get_review_detail import GetReviewDetail
from src.contexts.save.application.list_review_queue import ListReviewQueue
from src.contexts.save.application.resolve_review import ResolveReview
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure

router = APIRouter(
    prefix="/admin/save",
    tags=["admin-save"],
    dependencies=[Depends(require_capability(CapabilityKey.ADMIN_SAVE_MATCHING_REVIEW))],
)


@router.get("/review-queue")
def list_review_queue(
    market: str = Query("DO", description="Mercado (ISO 3166-1 alpha-2)"),
    provider_id: str | None = Query(None),
    method: str | None = Query(None),
    confidence_min: float | None = Query(None, ge=0, le=1),
    confidence_max: float | None = Query(None, ge=0, le=1),
    order_by: str = Query("uncertainty", description="uncertainty|created_at"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    use_case: ListReviewQueue = Depends(get_list_review_queue),
) -> AdminReviewQueueListDto:
    confidence_range = (
        (confidence_min, confidence_max)
        if confidence_min is not None and confidence_max is not None
        else None
    )
    rows, total = use_case.execute(
        market,
        provider_id=provider_id,
        method=method,
        confidence_range=confidence_range,
        order_by=order_by,
        limit=limit,
        offset=offset,
    )
    return AdminReviewQueueListDto.from_page(rows, total)


@router.get("/review-queue/{match_id}")
def review_detail(
    match_id: str,
    use_case: GetReviewDetail = Depends(get_review_detail),
) -> AdminReviewDetailDto:
    detail = use_case.execute(match_id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match no encontrado")
    return AdminReviewDetailDto.from_detail(detail)


class ResolveReviewRequest(BaseModel):
    canonical_product_id: str | None = None
    decided_by: str
    reason_code: str | None = None
    reason_note: str | None = None


@router.post("/review-queue/{match_id}/resolve")
def resolve_review(
    match_id: str,
    body: ResolveReviewRequest,
    use_case: ResolveReview = Depends(get_resolve_review),
) -> dict[str, str]:
    try:
        use_case.execute(
            match_id=match_id,
            canonical_product_id=body.canonical_product_id,
            decided_by=body.decided_by,
            reason_code=body.reason_code,
            reason_note=body.reason_note,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return {
        "match_id": match_id,
        "status": "auto_linked" if body.canonical_product_id else "rejected",
    }


class CreateCanonicalRequest(BaseModel):
    match_id: str
    decided_by: str
    name: str
    brand: str
    quantity_amount: Decimal
    quantity_measure: UnitMeasure
    taxonomy_node_id: str
    market_id: str
    quality: str | None = None
    display_size: str | None = None
    image_url: str | None = None


@router.post("/review-queue/create-canonical", status_code=status.HTTP_201_CREATED)
def create_canonical_and_link(
    body: CreateCanonicalRequest,
    use_case: CreateCanonicalAndLink = Depends(get_create_canonical_and_link),
) -> dict[str, str]:
    canonical_id = use_case.execute(
        match_id=body.match_id,
        product=NewCanonicalProduct(
            name=body.name,
            brand=body.brand,
            quantity=Quantity(body.quantity_amount, body.quantity_measure),
            taxonomy_node_id=body.taxonomy_node_id,
            market_id=body.market_id,
            quality=body.quality,
            display_size=body.display_size,
            image_url=body.image_url,
        ),
        decided_by=body.decided_by,
    )
    return {"canonical_product_id": canonical_id}


class BulkResolveRequestRow(BaseModel):
    match_id: str
    canonical_product_id: str | None = None
    decided_by: str
    reason_code: str | None = None
    reason_note: str | None = None


class BulkResolveRequest(BaseModel):
    rows: list[BulkResolveRequestRow]


@router.post("/review-queue/bulk-resolve")
def bulk_resolve_review(
    body: BulkResolveRequest,
    use_case: BulkResolveReview = Depends(get_bulk_resolve_review),
) -> BulkResolveResultDto:
    result = use_case.execute(
        [
            BulkResolveRow(
                match_id=r.match_id,
                canonical_product_id=r.canonical_product_id,
                decided_by=r.decided_by,
                reason_code=r.reason_code,
                reason_note=r.reason_note,
            )
            for r in body.rows
        ]
    )
    return BulkResolveResultDto.from_result(result)
