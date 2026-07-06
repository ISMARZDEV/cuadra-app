"""Admin Save controller — HTTP boundary de la consola de administración de Save (F2 · B1/B3).

Cola de revisión de matching: listar/ver detalle/resolver (aprobar-rechazar)/crear-canónico y
enlazar/bulk-resolver. Thin (SRP, igual convención que `save.py`): parsea el request, delega en
el use case, devuelve el DTO. TODA ruta exige `require_capability(ADMIN_SAVE_MATCHING_REVIEW)` —
este es el gate real (server-side); nunca confiar en un chequeo solo-cliente (SACRED).

`ingestion_router` (Batch 3A, F2·B1/B3): CRUD de Provider para la consola de "Ops de ingesta" —
capability DISTINTA (`ADMIN_SAVE_INGESTION_OPS`), separada de la cola de revisión de matching a
propósito (un rol con solo una de las dos no debe poder tocar la otra).
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from src.api.composition_root import (
    get_bulk_resolve_review,
    get_create_basket_query,
    get_create_canonical_and_link,
    get_create_provider,
    get_create_source,
    get_list_basket_queries,
    get_list_review_queue,
    get_list_sources_health,
    get_pause_source,
    get_remove_basket_query,
    get_resolve_review,
    get_resume_source,
    get_review_detail,
    get_set_provider_logo,
    get_test_source,
    get_update_basket_query,
    get_update_provider,
    get_update_source,
)
from src.api.extensions.security import require_capability
from src.contexts.identity.domain.enums import CapabilityKey
from src.contexts.save.application.basket_query import (
    CreateBasketQuery,
    ListBasketQueries,
    RemoveBasketQuery,
    UpdateBasketQuery,
)
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
from src.contexts.save.application.providers import CreateProvider, SetProviderLogo, UpdateProvider
from src.contexts.save.application.resolve_review import ResolveReview
from src.contexts.save.application.store_registry import (
    CreateSource,
    ListSourcesHealth,
    PauseSource,
    ResumeSource,
    UpdateSource,
)
from src.contexts.save.application.test_source import (
    TestSource,
    TestSourceConfigError,
    TestSourceUpstreamError,
)
from src.contexts.save.domain.entities import (
    BasketQuery,
    Provider,
    ProviderType,
    SourcePlatform,
    StoreRegistry,
)
from src.contexts.save.domain.source_health import SourceHealth, SourceHealthRow
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure

router = APIRouter(
    prefix="/admin/save",
    tags=["admin-save"],
    dependencies=[Depends(require_capability(CapabilityKey.ADMIN_SAVE_MATCHING_REVIEW))],
)

ingestion_router = APIRouter(
    prefix="/admin/save",
    tags=["admin-save-ingestion"],
    dependencies=[Depends(require_capability(CapabilityKey.ADMIN_SAVE_INGESTION_OPS))],
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


class ProviderDto(BaseModel):
    """Proyección admin de Provider (incluye `logo_url`, ausente del DTO público `ProviderRefDto`)."""

    id: str
    name: str
    type: ProviderType
    platform: SourcePlatform
    market_id: str
    logo_url: str | None = None

    @classmethod
    def from_entity(cls, provider: Provider) -> ProviderDto:
        return cls(
            id=provider.id,
            name=provider.name,
            type=provider.type,
            platform=provider.platform,
            market_id=provider.market_id,
            logo_url=provider.logo_url,
        )


class CreateProviderRequest(BaseModel):
    name: str
    type: ProviderType
    platform: SourcePlatform
    market_id: str
    logo_url: str | None = None


@ingestion_router.post("/providers", status_code=status.HTTP_201_CREATED)
def create_provider(
    body: CreateProviderRequest,
    use_case: CreateProvider = Depends(get_create_provider),
) -> ProviderDto:
    try:
        provider = use_case.execute(
            name=body.name,
            type=body.type,
            platform=body.platform,
            market_id=body.market_id,
            logo_url=body.logo_url,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return ProviderDto.from_entity(provider)


class UpdateProviderRequest(BaseModel):
    name: str | None = None
    type: ProviderType | None = None
    platform: SourcePlatform | None = None
    market_id: str | None = None


@ingestion_router.patch("/providers/{provider_id}")
def update_provider(
    provider_id: str,
    body: UpdateProviderRequest,
    use_case: UpdateProvider = Depends(get_update_provider),
) -> ProviderDto:
    try:
        provider = use_case.execute(
            provider_id,
            name=body.name,
            type=body.type,
            platform=body.platform,
            market_id=body.market_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return ProviderDto.from_entity(provider)


class SetProviderLogoRequest(BaseModel):
    logo_url: str | None = None


@ingestion_router.patch("/providers/{provider_id}/logo")
def set_provider_logo(
    provider_id: str,
    body: SetProviderLogoRequest,
    use_case: SetProviderLogo = Depends(get_set_provider_logo),
) -> ProviderDto:
    try:
        provider = use_case.execute(provider_id, body.logo_url)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return ProviderDto.from_entity(provider)


class SourceDto(BaseModel):
    """Proyección admin de StoreRegistry (Fuentes) — config de extracción por Provider (1:1)."""

    id: str
    provider_id: str
    platform: SourcePlatform
    base_url: str
    endpoints: dict | None = None
    headers: dict | None = None
    auth: dict | None = None
    enabled: bool
    health_status: str | None = None
    paused_at: datetime | None = None

    @classmethod
    def from_entity(cls, source: StoreRegistry) -> SourceDto:
        return cls(
            id=source.id,
            provider_id=source.provider_id,
            platform=source.platform,
            base_url=source.base_url,
            endpoints=source.endpoints,
            headers=source.headers,
            auth=source.auth,
            enabled=source.enabled,
            health_status=source.health_status,
            paused_at=source.paused_at,
        )


class CreateSourceRequest(BaseModel):
    provider_id: str
    platform: SourcePlatform
    base_url: str
    endpoints: dict | None = None
    headers: dict | None = None
    auth: dict | None = None


@ingestion_router.post("/sources", status_code=status.HTTP_201_CREATED)
def create_source(
    body: CreateSourceRequest,
    use_case: CreateSource = Depends(get_create_source),
) -> SourceDto:
    try:
        source = use_case.execute(
            provider_id=body.provider_id,
            platform=body.platform,
            base_url=body.base_url,
            endpoints=body.endpoints,
            headers=body.headers,
            auth=body.auth,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return SourceDto.from_entity(source)


class UpdateSourceRequest(BaseModel):
    platform: SourcePlatform | None = None
    base_url: str | None = None
    endpoints: dict | None = None
    headers: dict | None = None
    auth: dict | None = None


@ingestion_router.patch("/sources/{source_id}")
def update_source(
    source_id: str,
    body: UpdateSourceRequest,
    use_case: UpdateSource = Depends(get_update_source),
) -> SourceDto:
    try:
        source = use_case.execute(
            source_id,
            platform=body.platform,
            base_url=body.base_url,
            endpoints=body.endpoints,
            headers=body.headers,
            auth=body.auth,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return SourceDto.from_entity(source)


@ingestion_router.post("/sources/{source_id}/pause")
def pause_source(
    source_id: str,
    use_case: PauseSource = Depends(get_pause_source),
) -> SourceDto:
    try:
        source = use_case.execute(source_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return SourceDto.from_entity(source)


@ingestion_router.post("/sources/{source_id}/resume")
def resume_source(
    source_id: str,
    use_case: ResumeSource = Depends(get_resume_source),
) -> SourceDto:
    try:
        source = use_case.execute(source_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return SourceDto.from_entity(source)


class SourceHealthDto(BaseModel):
    """Fuente + salud EFECTIVA (F2·B1/B3, Batch 3E, tareas 3.18-3.19): pausa manual + frescura
    derivada a lectura de `store_product.last_seen_at`. Sin auto-detección de rotura de esquema."""

    id: str
    provider_id: str
    platform: SourcePlatform
    base_url: str
    enabled: bool
    paused_at: datetime | None = None
    health: SourceHealth

    @classmethod
    def from_row(cls, row: SourceHealthRow) -> SourceHealthDto:
        return cls(
            id=row.source.id,
            provider_id=row.source.provider_id,
            platform=row.source.platform,
            base_url=row.source.base_url,
            enabled=row.source.enabled,
            paused_at=row.source.paused_at,
            health=row.health,
        )


@ingestion_router.get("/sources/health")
def list_sources_health(
    market: str = Query("DO", description="Mercado (ISO 3166-1 alpha-2)"),
    use_case: ListSourcesHealth = Depends(get_list_sources_health),
) -> list[SourceHealthDto]:
    return [SourceHealthDto.from_row(row) for row in use_case.execute(market)]


class TestSourceRequest(BaseModel):
    query: str


class SampleEntryDto(BaseModel):
    """Proyección admin de `RawCatalogEntry` — la "muestra" del dry-run (features.md #13)."""

    external_id: str
    name: str
    brand: str
    price_minor: int
    currency: str
    ean: str | None = None
    url: str | None = None
    image_url: str | None = None


@ingestion_router.post("/sources/{source_id}/test")
def test_source(
    source_id: str,
    body: TestSourceRequest,
    use_case: TestSource = Depends(get_test_source),
) -> list[SampleEntryDto]:
    try:
        sample = use_case.execute(source_id, body.query)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except TestSourceConfigError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except TestSourceUpstreamError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return [
        SampleEntryDto(
            external_id=entry.external_id,
            name=entry.name,
            brand=entry.brand,
            price_minor=entry.price.amount_minor,
            currency=str(entry.price.currency),
            ean=entry.ean,
            url=entry.url,
            image_url=entry.image_url,
        )
        for entry in sample
    ]


class BasketQueryDto(BaseModel):
    """Proyección admin de BasketQuery — una query de la canasta curada (F2·B1/B3, Batch 3D)."""

    id: str
    market_id: str
    category_label: str | None = None
    query_text: str
    position: int
    active: bool

    @classmethod
    def from_entity(cls, query: BasketQuery) -> BasketQueryDto:
        return cls(
            id=query.id,
            market_id=query.market_id,
            category_label=query.category_label,
            query_text=query.query_text,
            position=query.position,
            active=query.active,
        )


@ingestion_router.get("/basket-queries")
def list_basket_queries(
    market: str = Query("DO", description="Mercado (ISO 3166-1 alpha-2)"),
    use_case: ListBasketQueries = Depends(get_list_basket_queries),
) -> list[BasketQueryDto]:
    return [BasketQueryDto.from_entity(q) for q in use_case.execute(market)]


class CreateBasketQueryRequest(BaseModel):
    market_id: str
    query_text: str
    category_label: str | None = None
    position: int = 0
    active: bool = True


@ingestion_router.post("/basket-queries", status_code=status.HTTP_201_CREATED)
def create_basket_query(
    body: CreateBasketQueryRequest,
    use_case: CreateBasketQuery = Depends(get_create_basket_query),
) -> BasketQueryDto:
    try:
        query = use_case.execute(
            market_id=body.market_id,
            query_text=body.query_text,
            category_label=body.category_label,
            position=body.position,
            active=body.active,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return BasketQueryDto.from_entity(query)


class UpdateBasketQueryRequest(BaseModel):
    category_label: str | None = None
    query_text: str | None = None
    position: int | None = None
    active: bool | None = None


@ingestion_router.patch("/basket-queries/{query_id}")
def update_basket_query(
    query_id: str,
    body: UpdateBasketQueryRequest,
    use_case: UpdateBasketQuery = Depends(get_update_basket_query),
) -> BasketQueryDto:
    try:
        query = use_case.execute(
            query_id,
            category_label=body.category_label,
            query_text=body.query_text,
            position=body.position,
            active=body.active,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return BasketQueryDto.from_entity(query)


@ingestion_router.delete("/basket-queries/{query_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_basket_query(
    query_id: str,
    use_case: RemoveBasketQuery = Depends(get_remove_basket_query),
) -> None:
    try:
        use_case.execute(query_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
