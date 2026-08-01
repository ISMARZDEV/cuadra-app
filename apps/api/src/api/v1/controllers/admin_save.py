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

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from src.api.composition_root import (
    get_admin_audit_repo,
    get_bulk_classify_review,
    get_bulk_create_canonicals,
    get_bulk_resolve_match_brands,
    get_bulk_resolve_review,
    get_create_basket_query,
    get_archive_provider,
    get_list_admin_providers,
    get_create_canonical_and_link,
    get_set_product_category,
    get_taxonomy_repo,
    get_create_provider,
    get_create_source,
    get_list_basket_queries,
    get_list_review_queue,
    get_list_store_product_images,
    get_list_sources_health,
    get_pause_source,
    get_remove_basket_query,
    get_resolve_review,
    get_resume_source,
    get_preview_basket_query,
    get_review_detail,
    get_set_provider_logo,
    get_test_source,
    get_update_basket_query,
    get_update_provider,
    get_update_source,
)
from src.api.extensions.security import get_current_user_id, require_capability
from src.contexts.identity.domain.enums import CapabilityKey
from src.contexts.save.application.admin_audit_recorder import AdminAuditRecorder
from src.contexts.save.domain.ports import AdminAuditRepository
from src.contexts.save.application.basket_query import (
    CreateBasketQuery,
    ListBasketQueries,
    RemoveBasketQuery,
    UpdateBasketQuery,
)
from src.contexts.save.application.bulk_classify_review import BulkClassifyReview
from src.contexts.save.application.bulk_create_canonicals import BulkCreateCanonicals
from src.contexts.save.application.bulk_resolve_brands import BulkResolveMatchBrands
from src.contexts.save.application.bulk_resolve_review import BulkResolveReview, BulkResolveRow
from src.contexts.save.application.set_product_category import SetProductCategory
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
from src.contexts.save.application.providers import (
    ArchiveProvider,
    CreateProvider,
    ListAdminProviders,
    SetProviderLogo,
    UpdateProvider,
)
from src.contexts.save.application.resolve_review import ResolveReview
from src.contexts.save.application.store_registry import (
    CreateSource,
    ListSourcesHealth,
    PauseSource,
    ResumeSource,
    UpdateSource,
)
from src.contexts.save.application.preview_basket_query import PreviewBasketQuery
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
from src.contexts.save.application.canonical_catalog import ListStoreProductImages
from src.contexts.save.domain.taxonomy import slugify
from src.contexts.save.domain.value_objects import parse_size
from src.contexts.save.infrastructure.catalog_sources.source_auth import mask_auth

MARKET = "DO"  # single-market, igual que el resto del admin

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


def get_admin_audit(
    audit_repo: AdminAuditRepository = Depends(get_admin_audit_repo),
    actor_user_id: str = Depends(get_current_user_id),
) -> AdminAuditRecorder:
    """Recorder de auditoría del request (T2): el repo (misma Session/UoW) + el actor autenticado.
    Los handlers de mutación lo reciben por `Depends` y auditan en el borde, en la misma transacción."""
    return AdminAuditRecorder(audit_repo, actor_user_id)


@router.get("/store-products/{store_product_id}/images", response_model=list[str])
def list_store_product_images(
    store_product_id: str,
    use_case: ListStoreProductImages = Depends(get_list_store_product_images),
) -> list[str]:
    """Galería que publicó la TIENDA, en su orden (`position`).

    Alimenta el lightbox de la Cola de revisión. Un id que no parsea devuelve `[]` y NO 404: es
    una lectura de presentación, y romper la fila entera por un id mal formado sería peor que
    mostrar la galería vacía.
    """
    return use_case.execute(store_product_id)


@router.get("/review-queue")
def list_review_queue(
    market: str = Query("DO", description="Mercado (ISO 3166-1 alpha-2)"),
    provider_id: str | None = Query(None),
    method: str | None = Query(None),
    confidence_min: float | None = Query(None, ge=0, le=1),
    confidence_max: float | None = Query(None, ge=0, le=1),
    run_id: str | None = Query(
        None,
        description=(
            "Deep-link corrida→cola (F4 #4.7): acota la cola a los matches producidos por esta "
            "corrida de Dagster. Lo emite la consola de Orquestación desde el resultado de un flow."
        ),
    ),
    order_by: str = Query(
        "uncertainty",
        description=(
            "Clave de orden; prefijo '-' = descendente (ej. '-created_at'). Claves: "
            "uncertainty|created_at|confidence|name|brand|provider|method|category|size"
        ),
    ),
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
        run_id=run_id,
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
    audit: AdminAuditRecorder = Depends(get_admin_audit),
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
    audit.record(
        "review.resolve" if body.canonical_product_id else "review.reject",
        "product_match",
        match_id,
        {"canonical_product_id": body.canonical_product_id, "reason_code": body.reason_code},
    )
    return {
        "match_id": match_id,
        "status": "auto_linked" if body.canonical_product_id else "rejected",
    }


class CreateCanonicalRequest(BaseModel):
    match_id: str
    decided_by: str
    name: str
    brand: str
    # El TAMAÑO viaja como TEXTO ("355 Ml"), no como cantidad ya convertida. Convertir a unidad
    # base es una REGLA DE DOMINIO (`parse_size`): si el navegador mandara `quantity_amount` +
    # `quantity_measure` tendría que conocer los factores, y dos implementaciones de la misma
    # regla —una en TS, otra en Python— se separan en cuanto aparece una unidad rara. Fue
    # exactamente lo que pasó: "355 Ml" llegaba como `Quantity(355, VOLUME)`, o sea 355 LITROS.
    # Mismo criterio que `BulkCreateCanonicals` y `PromoteStoreProductToCanonical`.
    size_text: str
    taxonomy_node_id: str
    market_id: str
    quality: str | None = None
    image_url: str | None = None


@router.post("/review-queue/create-canonical", status_code=status.HTTP_201_CREATED)
def create_canonical_and_link(
    body: CreateCanonicalRequest,
    use_case: CreateCanonicalAndLink = Depends(get_create_canonical_and_link),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> dict[str, str]:
    try:
        quantity = parse_size(body.size_text)
    except ValueError as exc:
        # Unidad desconocida: se REPORTA con el mensaje del dominio. Inventar una cantidad sería
        # peor que decirle al operador que ese tamaño no se pudo convertir.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    canonical_id = use_case.execute(
        match_id=body.match_id,
        product=NewCanonicalProduct(
            name=body.name,
            brand=body.brand,
            quantity=quantity,
            taxonomy_node_id=body.taxonomy_node_id,
            market_id=body.market_id,
            quality=body.quality,
            # El texto crudo es lo que la consola RENDERIZA (`CanonicalProductRow` lee
            # `display_size`, no `size_amount`/`size_measure`). `SqlCanonicalProductRepository.add`
            # lo canoniza con `normalize_size_text` ("20 Lbs" → "20 Lb").
            display_size=body.size_text,
            image_url=body.image_url,
        ),
        decided_by=body.decided_by,
    )
    audit.record(
        "review.create_canonical",
        "canonical_product",
        canonical_id,
        {"match_id": body.match_id, "name": body.name, "brand": body.brand},
        market_id=body.market_id,
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
    audit: AdminAuditRecorder = Depends(get_admin_audit),
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
    # Una entrada agregada para la operación en lote (evita inundar el log con N filas).
    audit.record(
        "review.bulk_resolve",
        "product_match",
        "bulk",
        {"count": len(body.rows), "match_ids": [r.match_id for r in body.rows]},
    )
    return BulkResolveResultDto.from_result(result)


class TaxonomyLeafDto(BaseModel):
    """Una HOJA de la taxonomía, con su id.

    Existe porque el endpoint público `/v1/save/categories` devuelve `slug`+`name` y NO ids, pero
    fijar una categoría necesita el `taxonomy_node_id`. El TOPE viaja con la hoja: "Arroz" solo es
    ambiguo entre categorías, y el operador elige mirando "Despensa › Arroz".
    """

    id: str
    name: str
    top_name: str
    # Slug del TOPE — el badge de la cola colorea por slug. Sin él, la celda optimista pintaría
    # gris neutro y CAMBIARÍA de color al refrescar: un parpadeo que se lee como si algo hubiera
    # fallado. Derivado en read-time con el mismo `slugify` que el listado público.
    top_slug: str


class TaxonomyLeavesDto(BaseModel):
    leaves: list[TaxonomyLeafDto]


@router.get("/taxonomy", response_model=TaxonomyLeavesDto)
def list_taxonomy_leaves(
    taxonomy=Depends(get_taxonomy_repo),  # type: ignore[no-untyped-def]
) -> TaxonomyLeavesDto:
    """Hojas de la taxonomía del mercado, para el selector de categoría de la cola.

    Es una LECTURA: no se audita (T2 registra mutaciones; auditar lecturas ahogaría el registro).
    """
    tree = taxonomy.list_tree(MARKET)
    return TaxonomyLeavesDto(
        leaves=[
            TaxonomyLeafDto(
                id=child.id, name=child.name, top_name=root.name, top_slug=slugify(root.name)
            )
            for root in tree
            for child in root.children
        ]
    )


class SetCategoryRequest(BaseModel):
    taxonomy_node_id: str
    decided_by: str


@router.put("/store-products/{store_product_id}/category")
def set_product_category(
    store_product_id: str,
    body: SetCategoryRequest,
    use_case: SetProductCategory = Depends(get_set_product_category),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> dict[str, str]:
    """Override HUMANO de la categoría de un store_product.

    `PUT` y no `PATCH`: la operación FIJA el valor completo del recurso "categoría del producto" y
    es idempotente — mandarla dos veces deja el mismo estado. No hay campos parciales que parchear.

    Es lo que hace posible editar la celda en la tabla, y con eso, que las excepciones se arreglen
    donde el operador tiene la imagen, la marca y el tamaño delante — en vez de dentro de un modal.
    """
    try:
        use_case.execute(
            store_product_id=store_product_id,
            taxonomy_node_id=body.taxonomy_node_id,
            decided_by=body.decided_by,
        )
    except ValueError as exc:
        # "Sin categoría" NO se persiste: la ausencia de fila activa ya significa eso.
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    audit.record(
        "review.set_category",
        "store_product",
        store_product_id,
        {"taxonomy_node_id": body.taxonomy_node_id},
        market_id=MARKET,
    )
    return {"store_product_id": store_product_id}


class BulkClassifyRequest(BaseModel):
    match_ids: list[str]


class BulkClassifyRowDto(BaseModel):
    match_id: str
    # `None` = corrió y NO decidió. Es un resultado legítimo, no un error.
    taxonomy_node_id: str | None
    method: str


class BulkClassifyFailureDto(BaseModel):
    match_id: str
    error: str


class BulkClassifyResultDto(BaseModel):
    """Resumen del lote, con TRES estados y no dos.

    `classified` / `undecided` (corrió y no decidió → trabajo para el humano) / `failed` (no se pudo
    ni intentar → problema). Fundir los dos últimos haría que un lote que resolvió 32 de 48 se
    leyera como terminado, y el operador se iría creyendo que no le queda nada por mirar.
    """

    classified: int
    undecided: int
    rows: list[BulkClassifyRowDto]
    failed: list[BulkClassifyFailureDto]


class BulkResolveBrandsRequest(BaseModel):
    match_ids: list[str]


class BulkBrandRowDto(BaseModel):
    ref_id: str
    brand: str | None
    source: str


class BulkBrandFailureDto(BaseModel):
    ref_id: str
    error: str


class BulkBrandResultDto(BaseModel):
    resolved: int
    unresolved: int
    skipped: int
    rows: list[BulkBrandRowDto]
    failed: list[BulkBrandFailureDto]


@router.post("/review-queue/bulk-resolve-brands", response_model=BulkBrandResultDto)
def bulk_resolve_review_brands(
    body: BulkResolveBrandsRequest,
    use_case: BulkResolveMatchBrands = Depends(get_bulk_resolve_match_brands),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> BulkBrandResultDto:
    """Rellena la marca de las filas seleccionadas de la cola, reconociéndola en el nombre.

    Auditoría AGREGADA (una entrada por lote), como el resto de acciones de la cola: acá se toca el
    dato crudo de una tienda, que la próxima corrida de ingesta puede volver a derivar — a
    diferencia del canónico, que es catálogo público y se audita fila por fila.
    """
    result = use_case.execute(body.match_ids)
    audit.record(
        "review.bulk_resolve_brands",
        "product_match",
        "bulk",
        {"count": len(body.match_ids), "resolved": result.resolved, "skipped": len(result.skipped)},
        market_id=MARKET,
    )
    return BulkBrandResultDto(
        resolved=result.resolved,
        unresolved=result.unresolved,
        skipped=len(result.skipped),
        rows=[BulkBrandRowDto(ref_id=r.ref_id, brand=r.brand, source=r.source) for r in result.rows],
        failed=[BulkBrandFailureDto(ref_id=f.ref_id, error=f.error) for f in result.failed],
    )


@router.post("/review-queue/bulk-classify", response_model=BulkClassifyResultDto)
def bulk_classify_review(
    body: BulkClassifyRequest,
    use_case: BulkClassifyReview = Depends(get_bulk_classify_review),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> BulkClassifyResultDto:
    """Clasifica en lote las filas seleccionadas de la cola.

    Corre SIN la etapa vectorial: `sentence-transformers` (BGE-M3) vive en el grupo de dependencias
    `ingestion` y la API deliberadamente no lo lleva. Resuelve por léxico del nombre + señal de
    ORIGEN — medido sobre la cola real, el 100%. Lo que no resuelva queda sin decidir, nunca
    inventado.
    """
    result = use_case.execute(body.match_ids, market_id=MARKET)
    # Una entrada AGREGADA por lote (evita inundar el registro con N filas), igual que bulk-resolve.
    audit.record(
        "review.bulk_classify",
        "product_match",
        "bulk",
        {"count": len(body.match_ids), "classified": result.classified},
        market_id=MARKET,
    )
    return BulkClassifyResultDto(
        classified=result.classified,
        undecided=result.undecided,
        rows=[
            BulkClassifyRowDto(
                match_id=r.match_id, taxonomy_node_id=r.taxonomy_node_id, method=r.method
            )
            for r in result.rows
        ],
        failed=[BulkClassifyFailureDto(match_id=f.match_id, error=f.error) for f in result.failed],
    )


class BulkCreateCanonicalsRequest(BaseModel):
    match_ids: list[str]
    # Categoría para las filas que NO tienen. `None` = no llenar huecos → esas filas se omiten.
    # NUNCA pisa una categoría ya decidida (regla del operador, fijada en el use case).
    fallback_taxonomy_node_id: str | None = None
    # Categoría elegida a mano para filas concretas (`match_id` → hoja). Gana sobre la propia y
    # sobre el fallback: es un acto deliberado del operador sobre ESA fila.
    overrides: dict[str, str] = {}
    decided_by: str


class SkippedRowDto(BaseModel):
    """Corrió y no se creó por falta de categoría. NO es un error: es un dato que nadie decidió."""

    match_id: str
    product_name: str


class BulkCreateCanonicalsResultDto(BaseModel):
    created: int
    canonical_ids: list[str]
    skipped: list[SkippedRowDto]
    failed: list[BulkClassifyFailureDto]


@router.post("/review-queue/bulk-create-canonical", response_model=BulkCreateCanonicalsResultDto)
def bulk_create_canonicals(
    body: BulkCreateCanonicalsRequest,
    use_case: BulkCreateCanonicals = Depends(get_bulk_create_canonicals),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> BulkCreateCanonicalsResultDto:
    """Convierte en canónicos las filas seleccionadas.

    Es la acción que la cola en arranque en frío necesita: sin canónicos en el catálogo nada matchea
    y "aprobar" (enlazar al candidato top) no tiene a qué enlazar. Nombre, marca y cantidad se
    derivan del store_product en el SERVIDOR —incluida la conversión de unidades vía `parse_size`
    del dominio— así que el navegador no manda N payloads ni conoce reglas de dominio.
    """
    result = use_case.execute(
        body.match_ids,
        fallback_taxonomy_node_id=body.fallback_taxonomy_node_id,
        decided_by=body.decided_by,
        overrides=body.overrides,
    )
    # Entrada AGREGADA por lote, igual que bulk-resolve (evita inundar el registro con N filas).
    audit.record(
        "review.bulk_create_canonical",
        "canonical_product",
        "bulk",
        {"count": len(body.match_ids), "created": result.created},
        market_id=MARKET,
    )
    return BulkCreateCanonicalsResultDto(
        created=result.created,
        canonical_ids=result.canonical_ids,
        skipped=[SkippedRowDto(match_id=s.match_id, product_name=s.product_name) for s in result.skipped],
        failed=[BulkClassifyFailureDto(match_id=f.match_id, error=f.error) for f in result.failed],
    )


class ProviderDto(BaseModel):
    """Proyección admin de Provider (incluye `logo_url`, ausente del DTO público `ProviderRefDto`)."""

    id: str
    name: str
    type: ProviderType
    platform: SourcePlatform
    market_id: str
    logo_url: str | None = None
    archived_at: datetime | None = None  # SOFT-delete (§7.2); NULL = activo

    @classmethod
    def from_entity(cls, provider: Provider) -> ProviderDto:
        return cls(
            id=provider.id,
            name=provider.name,
            type=provider.type,
            platform=provider.platform,
            market_id=provider.market_id,
            logo_url=provider.logo_url,
            archived_at=provider.archived_at,
        )


class CreateProviderRequest(BaseModel):
    name: str
    type: ProviderType
    platform: SourcePlatform
    market_id: str
    logo_url: str | None = None


@ingestion_router.get("/providers")
def list_admin_providers(
    market: str = Query("DO", description="Mercado (ISO 3166-1 alpha-2)"),
    include_archived: bool = Query(
        False, description="Incluye los archivados — la vista de recuperación de la consola"
    ),
    use_case: ListAdminProviders = Depends(get_list_admin_providers),
) -> list[ProviderDto]:
    """Listado ADMIN de providers con DTO completo (type/platform/market) — reemplaza el consumo
    del endpoint PÚBLICO `listProviders` (parcial) desde la consola (T1/#11).

    Excluye los archivados salvo que se pidan explícitamente: archivar tiene que sacarlos de la
    consola, pero sin `include_archived` un archivado por error sería irrecuperable desde la UI."""
    return [
        ProviderDto.from_entity(p)
        for p in use_case.execute(market, include_archived=include_archived)
    ]


@ingestion_router.post("/providers", status_code=status.HTTP_201_CREATED)
def create_provider(
    body: CreateProviderRequest,
    use_case: CreateProvider = Depends(get_create_provider),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
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
    audit.record(
        "provider.create",
        "provider",
        provider.id,
        {"name": provider.name, "type": provider.type.value, "platform": provider.platform.value},
        market_id=provider.market_id,
    )
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
    audit: AdminAuditRecorder = Depends(get_admin_audit),
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
    audit.record(
        "provider.update",
        "provider",
        provider.id,
        body.model_dump(exclude_none=True),
        market_id=provider.market_id,
    )
    return ProviderDto.from_entity(provider)


@ingestion_router.post("/providers/{provider_id}/archive")
def archive_provider(
    provider_id: str,
    use_case: ArchiveProvider = Depends(get_archive_provider),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> ProviderDto:
    """Archiva un provider — SOFT-delete (§7.2).

    NO borra la fila: `store_registry.provider_id` y `store_product.provider_id` apuntan acá por
    FK, así que un DELETE real arrastraría el histórico de precios completo de la cadena. Archivar
    solo lo saca de la consola y de la ingesta.
    """
    provider = use_case.execute(provider_id=provider_id, archived=True)
    if provider is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proveedor no encontrado.")

    audit.record(
        "provider.archive",
        "provider",
        provider.id,
        {"name": provider.name},
        market_id=provider.market_id,
    )
    return ProviderDto.from_entity(provider)


@ingestion_router.post("/providers/{provider_id}/unarchive")
def unarchive_provider(
    provider_id: str,
    use_case: ArchiveProvider = Depends(get_archive_provider),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> ProviderDto:
    """Restaura un provider archivado. Inversa exacta de `archive` — que esto pueda existir es
    justamente lo que obliga a que archivar no destruya nada."""
    provider = use_case.execute(provider_id=provider_id, archived=False)
    if provider is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proveedor no encontrado.")

    audit.record(
        "provider.unarchive",
        "provider",
        provider.id,
        {"name": provider.name},
        market_id=provider.market_id,
    )
    return ProviderDto.from_entity(provider)


class SetProviderLogoRequest(BaseModel):
    logo_url: str | None = None


@ingestion_router.patch("/providers/{provider_id}/logo")
def set_provider_logo(
    provider_id: str,
    body: SetProviderLogoRequest,
    use_case: SetProviderLogo = Depends(get_set_provider_logo),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> ProviderDto:
    try:
        provider = use_case.execute(provider_id, body.logo_url)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    audit.record(
        "provider.set_logo", "provider", provider.id,
        {"logo_url": body.logo_url}, market_id=provider.market_id,
    )
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
    audit: AdminAuditRecorder = Depends(get_admin_audit),
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
    # auth ENMASCARADO en el payload — el secreto nunca entra al log (write-only, cuadra-save-admin).
    audit.record(
        "source.create",
        "source",
        source.id,
        {"provider_id": source.provider_id, "platform": source.platform.value,
         "base_url": source.base_url, "auth": mask_auth(source.auth)},
    )
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
    audit: AdminAuditRecorder = Depends(get_admin_audit),
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
    # `auth: null` = "sin cambio" (write-only); si vino, se registra ENMASCARADO, nunca el secreto.
    changed = body.model_dump(exclude_none=True)
    if "auth" in changed:
        changed["auth"] = mask_auth(body.auth)
    audit.record("source.update", "source", source.id, changed)
    return SourceDto.from_entity(source)


@ingestion_router.post("/sources/{source_id}/pause")
def pause_source(
    source_id: str,
    use_case: PauseSource = Depends(get_pause_source),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> SourceDto:
    try:
        source = use_case.execute(source_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    audit.record("source.pause", "source", source.id)
    return SourceDto.from_entity(source)


@ingestion_router.post("/sources/{source_id}/resume")
def resume_source(
    source_id: str,
    use_case: ResumeSource = Depends(get_resume_source),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> SourceDto:
    try:
        source = use_case.execute(source_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    audit.record("source.resume", "source", source.id)
    return SourceDto.from_entity(source)


class SourceHealthDto(BaseModel):
    """Fuente + salud EFECTIVA (F2·B1/B3, Batch 3E, tareas 3.18-3.19): pausa manual + frescura
    derivada a lectura de `store_product.last_seen_at`. Sin auto-detección de rotura de esquema."""

    id: str
    provider_id: str
    provider_name: str  # nombre del súper (para las cards/lista)
    logo_url: str | None = None  # logo del proveedor (cards/lista)
    platform: SourcePlatform
    base_url: str
    enabled: bool
    paused_at: datetime | None = None
    health: SourceHealth
    # Señal cruda que sustenta el badge (contexto en la tabla): frescura + volumen. La Antigüedad
    # la deriva el cliente desde `last_seen_at`.
    last_seen_at: datetime | None = None
    product_count: int = 0
    # §15 (FASE 3): config completa para el prefill del modal de edición. `auth` viaja ENMASCARADO
    # (§15.5) — el secreto NUNCA sale en claro; para cambiarlo, el admin reescribe el campo.
    endpoints: dict | None = None
    headers: dict | None = None
    auth: dict | None = None

    @classmethod
    def from_row(cls, row: SourceHealthRow) -> SourceHealthDto:
        return cls(
            id=row.source.id,
            provider_id=row.source.provider_id,
            provider_name=row.provider_name,
            logo_url=row.logo_url,
            platform=row.source.platform,
            base_url=row.source.base_url,
            enabled=row.source.enabled,
            paused_at=row.source.paused_at,
            health=row.health,
            last_seen_at=row.last_seen_at,
            product_count=row.product_count,
            endpoints=row.source.endpoints,
            headers=row.source.headers,
            auth=mask_auth(row.source.auth),
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
    # `None` = la tienda NO publica marca (Magento y Bravo no la exponen), distinto de publicarla
    # vacía. Espeja `RawCatalogEntry.brand`; tenerlo como `str` a secas hacía que el dry-run
    # respondiera 500 en cuanto la fuente era una de esas dos.
    brand: str | None = None
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
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> list[SampleEntryDto]:
    try:
        sample = use_case.execute(source_id, body.query)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except TestSourceConfigError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except TestSourceUpstreamError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    # Dry-run (no persiste datos) pero SÍ es una acción del operador → se audita (SDD §6.2 "test").
    audit.record("source.test", "source", source_id, {"query": body.query, "results": len(sample)})
    return [
        SampleEntryDto(
            external_id=entry.external_id,
            name=entry.name,
            brand=entry.brand,
            price_minor=entry.price.amount_minor,
            currency=str(entry.price.currency),
            ean=entry.ean,
            url=entry.url,
            image_url=entry.primary_image_url,
        )
        for entry in sample
    ]


class PreviewBasketQueryRequest(BaseModel):
    """Preview de un término contra la(s) tienda(s) del mercado, ANTES de agregarlo a la canasta."""

    query_text: str
    market_id: str = "DO"
    provider_id: str | None = None  # None = todas las fuentes del mercado


class BasketPreviewGroupDto(BaseModel):
    """Lo que UNA tienda devolvería para el término. `error` None = ok; texto = esa fuente falló."""

    provider_id: str
    provider_name: str
    entries: list[SampleEntryDto] = []
    error: str | None = None


@ingestion_router.post("/basket-queries/preview")
def preview_basket_query(
    body: PreviewBasketQueryRequest,
    use_case: PreviewBasketQuery = Depends(get_preview_basket_query),
) -> list[BasketPreviewGroupDto]:
    groups = use_case.execute(body.query_text, body.market_id, body.provider_id)
    return [
        BasketPreviewGroupDto(
            provider_id=g.provider_id,
            provider_name=g.provider_name,
            entries=[
                SampleEntryDto(
                    external_id=e.external_id,
                    name=e.name,
                    brand=e.brand,
                    price_minor=e.price.amount_minor,
                    currency=str(e.price.currency),
                    ean=e.ean,
                    url=e.url,
                    image_url=e.primary_image_url,
                )
                for e in g.entries
            ],
            error=g.error,
        )
        for g in groups
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
    audit: AdminAuditRecorder = Depends(get_admin_audit),
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
    audit.record(
        "basket.create", "basket_query", query.id,
        {"query_text": query.query_text, "active": query.active}, market_id=query.market_id,
    )
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
    audit: AdminAuditRecorder = Depends(get_admin_audit),
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
    audit.record(
        "basket.update", "basket_query", query.id,
        body.model_dump(exclude_none=True), market_id=query.market_id,
    )
    return BasketQueryDto.from_entity(query)


@ingestion_router.delete("/basket-queries/{query_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_basket_query(
    query_id: str,
    use_case: RemoveBasketQuery = Depends(get_remove_basket_query),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> None:
    try:
        use_case.execute(query_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    audit.record("basket.delete", "basket_query", query_id)
