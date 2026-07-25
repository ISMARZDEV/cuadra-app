"""Admin Catálogo de Save (F5) — rutas admin de Productos Canónicos.

Router APARTE de `admin_save` y con capability PROPIA (`ADMIN_SAVE_CATALOG_OPS`): archivar
canónicos e importar en lote afecta el catálogo público y el histórico de matches, que es más
sensible que editar un provider. Mismo criterio que `admin_orchestration` (SDD §7).

Controller FINO (ADR 31): parsea, delega en el use case y arma el DTO. Cero SQLAlchemy acá — las
queries viven en `SqlAdminCanonicalCatalogRepository` y las reglas en `domain/canonical_catalog`.
Toda mutación escribe su fila de auditoría en la MISMA transacción del request (T2).

> **Archivar es SOFT-delete** (migración `1b48d0f4dc93`): estampa `archived_at` y saca el producto
> del sitio público, pero conserva la fila, el slug, el histórico de precios y los `product_match`.
> Un borrado físico dejaría `store_product.canonical_product_id` colgando y rompería comparaciones
> ya publicadas. `unarchive` es la operación inversa exacta.
"""
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from src.api.composition_root import (
    get_add_canonical_image,
    get_archive_canonical_product,
    get_bulk_set_canonical_category,
    get_canonical_price_history,
    get_commit_canonical_import,
    get_create_canonical_product,
    get_get_canonical_product,
    get_list_canonical_audit_log,
    get_list_canonical_duplicates,
    get_list_canonical_evidence,
    get_list_canonical_images,
    get_list_canonical_products,
    get_list_canonical_providers,
    get_preview_canonical_import,
    get_preview_canonical_slug,
    get_regenerate_canonical_slug,
    get_remove_canonical_image,
    get_reorder_canonical_images,
    get_set_canonical_category,
    get_suggest_bulk_categories,
    get_suggest_canonical_categories,
    get_update_canonical_product,
    get_update_internal_note,
)
from src.api.extensions.security import require_capability
from src.contexts.identity.domain.enums import CapabilityKey
from src.contexts.save.application.admin_audit_recorder import AdminAuditRecorder
from src.contexts.save.application.canonical_catalog import (
    AddCanonicalImage,
    ArchiveCanonicalProduct,
    BulkSetCanonicalCategory,
    CommitCanonicalImport,
    CreateCanonicalProduct,
    GetCanonicalPriceHistory,
    GetCanonicalProduct,
    InvalidMeasureError,
    MixedCurrencyHistoryError,
    ListCanonicalAuditLog,
    ListCanonicalDuplicates,
    ListCanonicalEvidence,
    ListCanonicalImages,
    ListCanonicalProducts,
    ListCanonicalProviders,
    PreviewCanonicalImport,
    PreviewCanonicalSlug,
    RegenerateCanonicalSlug,
    RemoveCanonicalImage,
    ReorderCanonicalImages,
    SetCanonicalCategory,
    SuggestBulkCategories,
    SuggestCanonicalCategories,
    UpdateCanonicalProduct,
    UpdateInternalNote,
    derive_row_quality,
)
from src.contexts.save.domain.canonical_history import CanonicalHistoryRange
from src.contexts.save.domain.canonical_catalog import (
    CanonicalCatalogFilters,
    CanonicalCatalogRow,
    CanonicalQualityStatus,
)
from src.contexts.save.domain.canonical_import import ImportRowInput
from src.contexts.save.infrastructure.repositories import DuplicateImageError

from .admin_save import get_admin_audit

catalog_router = APIRouter(
    prefix="/admin/save",
    tags=["admin-save-catalog"],
    dependencies=[Depends(require_capability(CapabilityKey.ADMIN_SAVE_CATALOG_OPS))],
)

MARKET = "DO"  # single-market, igual que el resto del admin


# ----------------------------------------------------------------------------------------- DTOs --


class AdminCanonicalProductRowDto(BaseModel):
    """Una fila del listado admin (US-CP-L1/L3).

    Los campos DERIVADOS no son columnas de `canonical_product`: se calculan a lectura. Ver
    `domain/canonical_catalog.py` para las reglas y por qué no se persisten.
    """

    canonical_product_id: str
    slug: str
    name: str
    brand: str
    display_size: str | None = None
    # ⚠️ Los campos reales son `size_amount` / `size_measure`, NO `quantity_*`.
    size_amount: Decimal
    size_measure: str
    image_url: str | None = None
    category: str | None = None
    taxonomy_node_id: str | None = None
    quality: str | None = None
    # DERIVADO: ≥1 store_product enlazado con EAN.
    ean_reachable: bool = False
    # De qué corrida nació el canónico (F4 #4.5). `None` = alta manual, bootstrap o pre-F4.
    origin_run_id: str | None = None
    matched_provider_count: int = 0
    possible_duplicate_count: int = 0
    last_price_seen_at: datetime | None = None
    last_match_at: datetime | None = None
    quality_statuses: list[str] = []
    completeness_score: int = 0
    # ── F5 detalle (migración 1b48d0f4dc93) ──
    description: str | None = None
    created_at: datetime | None = None
    # `internal_note` viaja SÓLO en este DTO de admin. El DTO público del producto no lo tiene:
    # es coordinación del equipo, no contenido.
    internal_note: str | None = None
    # `None` = activo. Un canónico archivado desaparece del sitio público pero sigue existiendo.
    archived_at: datetime | None = None

    @classmethod
    def from_row(cls, row: CanonicalCatalogRow, *, now: datetime | None = None):  # type: ignore[no-untyped-def]
        statuses, score = derive_row_quality(row, now=now)
        return cls(
            canonical_product_id=row.canonical_product_id,
            slug=row.slug,
            name=row.name,
            brand=row.brand,
            display_size=row.display_size,
            size_amount=row.size_amount,
            size_measure=row.size_measure,
            image_url=row.image_url,
            category=row.category,
            taxonomy_node_id=row.taxonomy_node_id,
            quality=row.quality,
            ean_reachable=row.ean_reachable,
            origin_run_id=row.origin_run_id,
            matched_provider_count=row.matched_provider_count,
            possible_duplicate_count=row.possible_duplicate_count,
            last_price_seen_at=row.last_price_seen_at,
            last_match_at=row.last_match_at,
            quality_statuses=[s.value for s in statuses],
            completeness_score=score,
            description=row.description,
            created_at=row.created_at,
            internal_note=row.internal_note,
            archived_at=row.archived_at,
        )


class AdminCanonicalProductListDto(BaseModel):
    """Envelope del listado con el total REAL (contado sin limit/offset)."""

    rows: list[AdminCanonicalProductRowDto]
    total: int


class AdminCanonicalProviderPriceDto(BaseModel):
    """Una tienda del modal de proveedores (US-CP-L4).

    `price_minor` va en MINOR UNITS. El formateo es responsabilidad exclusiva de la UI — regla
    sagrada de Save, nunca floats para dinero.
    """

    provider_id: str
    provider_name: str
    store_product_id: str
    price_minor: int
    currency: str
    provider_logo_url: str | None = None
    store_product_image_url: str | None = None
    # TODAS las imágenes que publica esa tienda, en su orden. Son las candidatas de la galería
    # del canónico: la etiqueta nutricional de Sirena vive acá, no en `store_product_image_url`.
    store_product_image_urls: list[str] = []
    url: str | None = None
    last_seen_at: datetime | None = None
    is_cheapest: bool = False


class AdminCanonicalEvidenceDto(BaseModel):
    """Evidencia cruda por tienda (US-CP-D8). Sólo lectura: v1 no reasigna matches."""

    store_product_id: str
    provider_id: str
    provider_name: str
    raw_name: str
    raw_brand: str | None = None
    raw_size_text: str | None = None
    ean: str | None = None
    sku: str | None = None
    image_url: str | None = None
    store_product_url: str | None = None
    match_method: str | None = None
    match_confidence: float | None = None
    matched_at: datetime | None = None


class AdminCanonicalDuplicateDto(BaseModel):
    """Candidato a duplicado (US-CP-D11). Sólo ALERTA — merge/split fuera de alcance."""

    canonical_product_id: str
    slug: str
    name: str
    brand: str
    display_size: str | None = None
    category: str | None = None
    signals: list[str] = []
    has_ean_collision: bool = False


class CreateCanonicalProductRequest(BaseModel):
    """Alta manual (US-CP-L7). `size_amount`/`size_measure` son NOT NULL en el modelo."""

    name: str = Field(min_length=1)
    size_amount: Decimal = Field(gt=0)
    size_measure: str = Field(description="mass | volume | count")
    brand: str | None = None
    quality: str | None = None
    display_size: str | None = None
    image_url: str | None = None
    taxonomy_node_id: str | None = None
    description: str | None = None


class UpdateCanonicalProductRequest(BaseModel):
    """Edición básica (US-CP-L5/D2). `None` = no cambiar ese campo.

    El slug NO se regenera: es la llave pública de la página del producto y cambiarlo al editar
    el nombre rompería enlaces compartidos y el canonical SEO en silencio (US-CP-D2b).
    """

    name: str | None = Field(default=None, min_length=1)
    brand: str | None = None
    size_amount: Decimal | None = Field(default=None, gt=0)
    size_measure: str | None = None
    quality: str | None = None
    display_size: str | None = None
    image_url: str | None = None
    taxonomy_node_id: str | None = None
    description: str | None = None
    clear_taxonomy: bool = False


class ImportRowRequest(BaseModel):
    """Fila cruda del CSV/pegado. Todo string: un CSV no tiene tipos y validar es el paso 2."""

    name: str = ""
    size_amount: str = ""
    size_measure: str = ""
    brand: str | None = None
    display_size: str | None = None
    quality: str | None = None
    image_url: str | None = None
    category: str | None = None


class ImportRequest(BaseModel):
    rows: list[ImportRowRequest]


class ImportIssueDto(BaseModel):
    row_index: int
    message: str
    field: str | None = None


class ImportPreviewDto(BaseModel):
    """Paso 2 del import: qué entraría, qué no y qué avisar. NADA persistido."""

    valid_rows: list[ImportRowRequest]
    invalid_rows: list[ImportIssueDto]
    warnings: list[ImportIssueDto]
    valid_count: int
    invalid_count: int


class ImportCommitDto(BaseModel):
    """Paso 3 del import: qué entró de verdad."""

    imported: list[AdminCanonicalProductRowDto]
    errors: list[ImportIssueDto]
    warnings: list[ImportIssueDto]
    imported_count: int
    error_count: int


# ------------------------------------------------------------------------------------- rutas --


@catalog_router.get("/canonical-products", response_model=AdminCanonicalProductListDto)
def list_canonical_products(
    search: str | None = Query(None, description="Busca en nombre, slug y marca"),
    brand_id: str | None = Query(None),
    taxonomy_node_id: str | None = Query(None),
    quality_status: CanonicalQualityStatus | None = Query(
        None, description="complete|no_image|no_category|no_providers|no_quality|stale_price|possible_duplicate"
    ),
    ean_reachable: bool | None = Query(None),
    include_archived: bool = Query(
        False, description="Incluir archivados (por defecto el catálogo muestra sólo activos)"
    ),
    min_provider_count: int | None = Query(None, ge=0, description="Cobertura mínima"),
    updated_since: datetime | None = Query(
        None, description="Sólo canónicos con precio visto desde esta fecha"
    ),
    sort: str = Query(
        "name", description="name|providers|completeness|updated; prefijo '-' = descendente"
    ),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    use_case: ListCanonicalProducts = Depends(get_list_canonical_products),
) -> AdminCanonicalProductListDto:
    """Listado admin del catálogo canónico (US-CP-L1/L2/L3/L9)."""
    page = use_case.execute(
        market_id=MARKET,
        filters=CanonicalCatalogFilters(
            search=search,
            brand_id=brand_id,
            taxonomy_node_id=taxonomy_node_id,
            quality_status=quality_status,
            ean_reachable=ean_reachable,
            min_provider_count=min_provider_count,
            updated_since=updated_since,
            include_archived=include_archived,
        ),
        limit=limit,
        offset=offset,
        sort=sort,
    )
    return AdminCanonicalProductListDto(
        rows=[AdminCanonicalProductRowDto.from_row(r) for r in page.rows],
        total=page.total,
    )


@catalog_router.post(
    "/canonical-products",
    response_model=AdminCanonicalProductRowDto,
    status_code=status.HTTP_201_CREATED,
)
def create_canonical_product(
    body: CreateCanonicalProductRequest,
    use_case: CreateCanonicalProduct = Depends(get_create_canonical_product),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> AdminCanonicalProductRowDto:
    """Alta manual de un canónico (US-CP-L7). Nace con 0 proveedores y marca en MAYÚSCULA."""
    try:
        row = use_case.execute(
            market_id=MARKET,
            name=body.name,
            size_amount=body.size_amount,
            size_measure=body.size_measure,
            brand=body.brand,
            quality=body.quality,
            display_size=body.display_size,
            image_url=body.image_url,
            taxonomy_node_id=body.taxonomy_node_id,
            description=body.description,
        )
    except InvalidMeasureError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    audit.record(
        "canonical_product.create",
        "canonical_product",
        row.canonical_product_id,
        {"name": row.name, "brand": row.brand, "slug": row.slug, "origin": "manual_admin"},
    )
    return AdminCanonicalProductRowDto.from_row(row)


@catalog_router.post("/canonical-products/import/preview", response_model=ImportPreviewDto)
def preview_canonical_import(
    body: ImportRequest,
    use_case: PreviewCanonicalImport = Depends(get_preview_canonical_import),
) -> ImportPreviewDto:
    """Paso 2 del import (US-CP-L8): validar sin persistir.

    NO audita: previsualizar no cambia nada, y una fila de auditoría por cada preview ahogaría el
    log de lo que sí pasó.
    """
    preview = use_case.execute(
        market_id=MARKET, rows=[ImportRowInput(**r.model_dump()) for r in body.rows]
    )
    return ImportPreviewDto(
        valid_rows=[
            ImportRowRequest(
                name=r.name,
                size_amount=str(r.size_amount),
                size_measure=r.size_measure,
                brand=r.brand,
                display_size=r.display_size,
                quality=r.quality,
                image_url=r.image_url,
                category=r.category,
            )
            for r in preview.valid_rows
        ],
        invalid_rows=[ImportIssueDto(**asdict(i)) for i in preview.invalid_rows],
        warnings=[ImportIssueDto(**asdict(w)) for w in preview.warnings],
        valid_count=preview.valid_count,
        invalid_count=preview.invalid_count,
    )


@catalog_router.post(
    "/canonical-products/import/commit",
    response_model=ImportCommitDto,
    status_code=status.HTTP_201_CREATED,
)
def commit_canonical_import(
    body: ImportRequest,
    use_case: CommitCanonicalImport = Depends(get_commit_canonical_import),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> ImportCommitDto:
    """Paso 3 del import (US-CP-L8): persistir. Cada fila creada queda auditada con
    `origin=bulk_import`, y una fila que falla no arrastra a las demás (savepoint por fila)."""
    result = use_case.execute(
        market_id=MARKET, rows=[ImportRowInput(**r.model_dump()) for r in body.rows]
    )
    for row in result.imported:
        audit.record(
            "canonical_product.import",
            "canonical_product",
            row.canonical_product_id,
            {"name": row.name, "brand": row.brand, "slug": row.slug, "origin": "bulk_import"},
        )
    return ImportCommitDto(
        imported=[AdminCanonicalProductRowDto.from_row(r) for r in result.imported],
        errors=[ImportIssueDto(**asdict(e)) for e in result.errors],
        warnings=[ImportIssueDto(**asdict(w)) for w in result.warnings],
        imported_count=result.imported_count,
        error_count=result.error_count,
    )


@catalog_router.get(
    "/canonical-products/{canonical_product_id}", response_model=AdminCanonicalProductRowDto
)
def get_canonical_product(
    canonical_product_id: str,
    use_case: GetCanonicalProduct = Depends(get_get_canonical_product),
) -> AdminCanonicalProductRowDto:
    """Detalle del canónico por id (US-CP-D1). Mismas métricas que el listado, a propósito."""
    row = use_case.execute(market_id=MARKET, canonical_product_id=canonical_product_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto canónico no encontrado.")
    return AdminCanonicalProductRowDto.from_row(row)


@catalog_router.patch(
    "/canonical-products/{canonical_product_id}", response_model=AdminCanonicalProductRowDto
)
def update_canonical_product(
    canonical_product_id: str,
    body: UpdateCanonicalProductRequest,
    use_case: UpdateCanonicalProduct = Depends(get_update_canonical_product),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> AdminCanonicalProductRowDto:
    """Edición básica del canónico (US-CP-L5/D2). El slug queda ESTABLE."""
    if body.size_amount is not None and body.size_measure is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Para cambiar el tamaño hay que mandar `size_amount` y `size_measure` juntos.",
        )
    try:
        row = use_case.execute(
            market_id=MARKET,
            canonical_product_id=canonical_product_id,
            name=body.name,
            brand=body.brand,
            size_amount=body.size_amount,
            size_measure=body.size_measure,
            quality=body.quality,
            display_size=body.display_size,
            image_url=body.image_url,
            taxonomy_node_id=body.taxonomy_node_id,
            description=body.description,
            clear_taxonomy=body.clear_taxonomy,
        )
    except InvalidMeasureError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto canónico no encontrado.")

    audit.record(
        "canonical_product.update",
        "canonical_product",
        row.canonical_product_id,
        {
            "changed": sorted(
                k for k, v in body.model_dump(exclude={"clear_taxonomy"}).items() if v is not None
            ),
            "name": row.name,
            "origin": "manual_admin",
        },
    )
    return AdminCanonicalProductRowDto.from_row(row)


@catalog_router.get(
    "/canonical-products/{canonical_product_id}/providers",
    response_model=list[AdminCanonicalProviderPriceDto],
)
def list_canonical_product_providers(
    canonical_product_id: str,
    use_case: ListCanonicalProviders = Depends(get_list_canonical_providers),
    detail: GetCanonicalProduct = Depends(get_get_canonical_product),
) -> list[AdminCanonicalProviderPriceDto]:
    """Proveedores matcheados, más barato primero (US-CP-L4/D5).

    404 si el canónico no existe: devolver `[]` haría indistinguible "no tiene proveedores" de
    "ese producto no existe", y son dos problemas distintos para el operador.
    """
    if detail.execute(market_id=MARKET, canonical_product_id=canonical_product_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto canónico no encontrado.")
    return [
        AdminCanonicalProviderPriceDto(
            provider_id=p.provider_id,
            provider_name=p.provider_name,
            store_product_id=p.store_product_id,
            price_minor=p.price_minor,
            currency=p.currency,
            provider_logo_url=p.provider_logo_url,
            store_product_image_url=p.store_product_image_url,
            store_product_image_urls=p.store_product_image_urls,
            url=p.url,
            last_seen_at=p.last_seen_at,
            is_cheapest=p.is_cheapest,
        )
        for p in use_case.execute(canonical_product_id)
    ]


@catalog_router.get(
    "/canonical-products/{canonical_product_id}/evidence",
    response_model=list[AdminCanonicalEvidenceDto],
)
def list_canonical_product_evidence(
    canonical_product_id: str,
    use_case: ListCanonicalEvidence = Depends(get_list_canonical_evidence),
) -> list[AdminCanonicalEvidenceDto]:
    """Evidencia/origen del canónico (US-CP-D8): qué dijo cada tienda y cómo se enlazó."""
    return [AdminCanonicalEvidenceDto(**asdict(e)) for e in use_case.execute(canonical_product_id)]


@catalog_router.get(
    "/canonical-products/{canonical_product_id}/duplicate-candidates",
    response_model=list[AdminCanonicalDuplicateDto],
)
def list_canonical_product_duplicates(
    canonical_product_id: str,
    limit: int = Query(20, ge=1, le=50),
    use_case: ListCanonicalDuplicates = Depends(get_list_canonical_duplicates),
) -> list[AdminCanonicalDuplicateDto]:
    """Duplicados posibles (US-CP-D11), colisión de EAN primero. Sólo alerta."""
    return [
        AdminCanonicalDuplicateDto(
            canonical_product_id=c.canonical_product_id,
            slug=c.slug,
            name=c.name,
            brand=c.brand,
            display_size=c.display_size,
            category=c.category,
            signals=c.signals,
            has_ean_collision=c.has_ean_collision,
        )
        for c in use_case.execute(
            canonical_product_id=canonical_product_id, market_id=MARKET, limit=limit
        )
    ]


@catalog_router.post(
    "/canonical-products/{canonical_product_id}/archive",
    response_model=AdminCanonicalProductRowDto,
)
def archive_canonical_product(
    canonical_product_id: str,
    use_case: ArchiveCanonicalProduct = Depends(get_archive_canonical_product),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> AdminCanonicalProductRowDto:
    """Archiva un canónico (US-CP-L6/D12).

    SOFT-delete: estampa `archived_at` y lo saca del sitio público. NO borra la fila ni desenlaza
    las tiendas — el histórico de precios y los `product_match` sobreviven intactos, porque un
    borrado real rompería comparaciones ya publicadas.
    """
    row = use_case.execute(
        market_id=MARKET, canonical_product_id=canonical_product_id, archived=True
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto canónico no encontrado.")

    audit.record(
        "canonical_product.archive",
        "canonical_product",
        row.canonical_product_id,
        {"name": row.name, "slug": row.slug, "origin": "archive"},
    )
    return AdminCanonicalProductRowDto.from_row(row)


@catalog_router.post(
    "/canonical-products/{canonical_product_id}/unarchive",
    response_model=AdminCanonicalProductRowDto,
)
def unarchive_canonical_product(
    canonical_product_id: str,
    use_case: ArchiveCanonicalProduct = Depends(get_archive_canonical_product),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> AdminCanonicalProductRowDto:
    """Restaura un canónico archivado. Inversa exacta de `archive` — por eso el archivado NO puede
    ser destructivo: si borrara, esto no podría existir."""
    row = use_case.execute(
        market_id=MARKET, canonical_product_id=canonical_product_id, archived=False
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto canónico no encontrado.")

    audit.record(
        "canonical_product.unarchive",
        "canonical_product",
        row.canonical_product_id,
        {"name": row.name, "slug": row.slug, "origin": "archive"},
    )
    return AdminCanonicalProductRowDto.from_row(row)


class UpdateInternalNoteRequest(BaseModel):
    """Nota interna del operador (US-CP-D10). Vacío o `null` borra la nota."""

    internal_note: str | None = None


@catalog_router.patch(
    "/canonical-products/{canonical_product_id}/internal-note",
    response_model=AdminCanonicalProductRowDto,
)
def update_internal_note(
    canonical_product_id: str,
    body: UpdateInternalNoteRequest,
    use_case: UpdateInternalNote = Depends(get_update_internal_note),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> AdminCanonicalProductRowDto:
    """Guarda la nota interna (US-CP-D10).

    ⚠️ El CONTENIDO de la nota NO entra en el payload de auditoría: el log se lee en otra pantalla
    y se exporta, así que copiarlo ahí duplicaría contenido interno en una superficie con otro
    control de acceso. Se audita QUE cambió, no QUÉ dice.
    """
    row = use_case.execute(
        market_id=MARKET,
        canonical_product_id=canonical_product_id,
        note=body.internal_note,
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto canónico no encontrado.")

    audit.record(
        "canonical_product.internal_note",
        "canonical_product",
        row.canonical_product_id,
        {"name": row.name, "has_note": row.internal_note is not None, "origin": "manual_admin"},
    )
    return AdminCanonicalProductRowDto.from_row(row)


class PricePointDto(BaseModel):
    """Un punto de CAMBIO de precio. `price_minor` en minor units — el chart formatea, no calcula."""

    captured_at: datetime
    price_minor: int
    price_type: str


class ProviderSeriesDto(BaseModel):
    provider_id: str
    provider_name: str
    points: list[PricePointDto]


class CanonicalPriceKpisDto(BaseModel):
    """KPIs del rango (US-CP-D6). Los `None` significan SIN DATOS, no cero: cero pesos es un
    precio válido y pintarlo donde no hay histórico sería mentirle al operador."""

    min_price_minor: int | None = None
    max_price_minor: int | None = None
    spread_minor: int | None = None
    active_provider_count: int = 0
    last_updated_at: datetime | None = None
    change_in_range_minor: int | None = None
    price_change_count: int = 0


class AdminCanonicalPriceHistoryDto(BaseModel):
    canonical_product_id: str
    name: str
    currency: str
    range: str
    series: list[ProviderSeriesDto]
    kpis: CanonicalPriceKpisDto


@catalog_router.get(
    "/canonical-products/{canonical_product_id}/history",
    response_model=AdminCanonicalPriceHistoryDto,
)
def get_canonical_product_history(
    canonical_product_id: str,
    range: CanonicalHistoryRange = Query(
        CanonicalHistoryRange.ONE_MONTH, description="15d|1m|3m|6m|1y|all"
    ),
    provider_ids: list[str] | None = Query(
        None, description="Acota el chart a estas tiendas; vacío = todas"
    ),
    use_case: GetCanonicalPriceHistory = Depends(get_canonical_price_history),
) -> AdminCanonicalPriceHistoryDto:
    """Histórico multi-tienda + KPIs (US-CP-D6/D7).

    Cada serie arranca con el precio VIGENTE al comenzar el rango (baseline carry-in): la tabla
    `price` es change-only, así que una tienda que no movió su precio no tiene puntos adentro y
    su línea aparecería vacía — que no es lo mismo que "el precio no cambió".
    """
    try:
        history = use_case.execute(
            market_id=MARKET,
            canonical_product_id=canonical_product_id,
            range_=range,
            provider_ids=provider_ids,
        )
    except MixedCurrencyHistoryError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc

    if history is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto canónico no encontrado.")

    return AdminCanonicalPriceHistoryDto(
        canonical_product_id=history.canonical_product_id,
        name=history.name,
        currency=history.currency,
        range=history.range,
        series=[
            ProviderSeriesDto(
                provider_id=provider_id,
                provider_name=points[0].provider_name if points else provider_id,
                points=[
                    PricePointDto(
                        captured_at=p.captured_at,
                        price_minor=p.price.amount_minor,
                        price_type=p.price_type.value,
                    )
                    for p in points
                ],
            )
            for provider_id, points in history.series.items()
        ],
        kpis=CanonicalPriceKpisDto(**asdict(history.kpis)),
    )


class AdminCanonicalAuditEventDto(BaseModel):
    """Un evento del audit log del canónico (US-CP-D9).

    `payload_summary` es un resumen, no el diff completo: nunca lleva secretos ni el contenido de
    la nota interna (ver `update_internal_note`).
    """

    id: str
    action: str
    actor_user_id: str
    payload_summary: dict = {}
    created_at: datetime


@catalog_router.get(
    "/canonical-products/{canonical_product_id}/audit-log",
    response_model=list[AdminCanonicalAuditEventDto],
)
def list_canonical_product_audit_log(
    canonical_product_id: str,
    limit: int = Query(50, ge=1, le=200),
    use_case: ListCanonicalAuditLog = Depends(get_list_canonical_audit_log),
) -> list[AdminCanonicalAuditEventDto]:
    """Actividad del canónico, más reciente primero (US-CP-D9). Estado vacío si nunca se tocó —
    un canónico creado por la cascada y no editado no tiene eventos, y eso no es un error."""
    return [
        AdminCanonicalAuditEventDto(
            id=e.id,
            action=e.action,
            actor_user_id=e.actor_user_id,
            payload_summary=e.payload_summary,
            created_at=e.created_at,
        )
        for e in use_case.execute(
            market_id=MARKET, canonical_product_id=canonical_product_id, limit=limit
        )
    ]


class SlugPreviewDto(BaseModel):
    """Preview de la regeneración de slug (US-CP-D2b).

    `would_change=False` es la respuesta esperada cuando nadie editó nada: sirve para que la UI
    no ofrezca una acción que cambiaría la URL pública a cambio de nada.
    """

    current_slug: str
    new_slug: str
    would_change: bool


@catalog_router.get(
    "/canonical-products/{canonical_product_id}/slug-preview", response_model=SlugPreviewDto
)
def preview_canonical_slug(
    canonical_product_id: str,
    use_case: PreviewCanonicalSlug = Depends(get_preview_canonical_slug),
) -> SlugPreviewDto:
    """Qué slug tendría el canónico si se regenerara. NO persiste nada.

    La regla del slug vive en el dominio; replicarla en el cliente para previsualizar la
    duplicaría en dos lenguajes y divergirían al primer cambio.
    """
    result = use_case.execute(canonical_product_id)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto canónico no encontrado.")
    current, candidate = result
    return SlugPreviewDto(
        current_slug=current, new_slug=candidate, would_change=candidate != current
    )


@catalog_router.post(
    "/canonical-products/{canonical_product_id}/regenerate-slug",
    response_model=AdminCanonicalProductRowDto,
)
def regenerate_canonical_slug(
    canonical_product_id: str,
    use_case: RegenerateCanonicalSlug = Depends(get_regenerate_canonical_slug),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> AdminCanonicalProductRowDto:
    """Regenera el slug público (US-CP-D2b). ACCIÓN EXPLÍCITA: editar el nombre NUNCA la dispara.

    Se auditan `old_slug` y `new_slug` porque son el único rastro para saber a qué URL redirigir
    cuando alguien reporte un enlace roto.
    """
    result = use_case.execute(market_id=MARKET, canonical_product_id=canonical_product_id)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto canónico no encontrado.")
    row, old_slug, new_slug = result

    audit.record(
        "canonical_product.regenerate_slug",
        "canonical_product",
        row.canonical_product_id,
        {"old_slug": old_slug, "new_slug": new_slug, "origin": "manual_admin"},
    )
    return AdminCanonicalProductRowDto.from_row(row)


class CategorySuggestionDto(BaseModel):
    """Una hoja propuesta CON su evidencia (US-CP-D2c).

    `matched_tokens` no es decorativo: es la señal de origen que convierte la sugerencia en una
    decisión informada en vez de una caja negra.
    """

    taxonomy_node_id: str
    name: str
    matched_tokens: list[str]
    signal: str


@catalog_router.get(
    "/canonical-products/{canonical_product_id}/category-suggestions",
    response_model=list[CategorySuggestionDto],
)
def suggest_canonical_categories(
    canonical_product_id: str,
    limit: int = Query(5, ge=1, le=10),
    use_case: SuggestCanonicalCategories = Depends(get_suggest_canonical_categories),
) -> list[CategorySuggestionDto]:
    """Sugerencias de categoría del clasificador ya construido (US-CP-D2c).

    Deterministas (léxico), sin IA generativa. Lista vacía = no hay señal, y el árbol completo es
    el fallback: inventar una categoría es exactamente lo que el módulo tiene prohibido.
    """
    return [
        CategorySuggestionDto(
            taxonomy_node_id=node_id, name=name, matched_tokens=tokens, signal=signal
        )
        for node_id, name, tokens, signal in use_case.execute(
            market_id=MARKET, canonical_product_id=canonical_product_id, limit=limit
        )
    ]


class SetCategoryRequest(BaseModel):
    taxonomy_node_id: str


@catalog_router.patch(
    "/canonical-products/{canonical_product_id}/category",
    response_model=AdminCanonicalProductRowDto,
)
def set_canonical_category(
    canonical_product_id: str,
    body: SetCategoryRequest,
    use_case: SetCanonicalCategory = Depends(get_set_canonical_category),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> AdminCanonicalProductRowDto:
    """Asigna la categoría del canónico (US-CP-D2c). Queda registrada como decisión HUMANA."""
    try:
        result = use_case.execute(
            market_id=MARKET,
            canonical_product_id=canonical_product_id,
            taxonomy_node_id=body.taxonomy_node_id,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto canónico no encontrado.")
    row, old_category = result

    audit.record(
        "canonical_product.set_category",
        "canonical_product",
        row.canonical_product_id,
        {
            "old_category": old_category,
            "new_category": row.category,
            "method": "human",
            "origin": "manual_admin",
        },
    )
    return AdminCanonicalProductRowDto.from_row(row)


class BulkCategorySuggestionsRequest(BaseModel):
    canonical_product_ids: list[str]


class BulkCategorySuggestionDto(BaseModel):
    """Hoja propuesta para el LOTE, con cuántos de los seleccionados la apoyan."""

    taxonomy_node_id: str
    name: str
    product_count: int
    matched_tokens: list[str]
    signal: str


class BulkCategoryAdviceDto(BaseModel):
    """Qué proponer para el lote y qué advertir ANTES de aplicarlo (US-CP-L10).

    `heterogeneous` es el dato que evita el peor caso: asignar una sola categoría a productos que
    el léxico ve como distintos ensucia varios de un saque, y deshacerlo cuesta más que evitarlo.
    """

    suggestions: list[BulkCategorySuggestionDto]
    heterogeneous: bool
    without_signal: int
    selected_count: int


@catalog_router.post(
    "/canonical-products/bulk-category-suggestions", response_model=BulkCategoryAdviceDto
)
def suggest_bulk_categories(
    body: BulkCategorySuggestionsRequest,
    use_case: SuggestBulkCategories = Depends(get_suggest_bulk_categories),
) -> BulkCategoryAdviceDto:
    """Sugerencias calculadas sobre el CONJUNTO seleccionado. No persiste nada."""
    advice, names = use_case.execute(
        market_id=MARKET, canonical_product_ids=body.canonical_product_ids
    )
    return BulkCategoryAdviceDto(
        suggestions=[
            BulkCategorySuggestionDto(
                taxonomy_node_id=s.taxonomy_node_id,
                name=names.get(s.taxonomy_node_id, ""),
                product_count=s.product_count,
                matched_tokens=s.matched_tokens,
                signal=s.signal,
            )
            for s in advice.suggestions
        ],
        heterogeneous=advice.heterogeneous,
        without_signal=advice.without_signal,
        selected_count=len(body.canonical_product_ids),
    )


class BulkSetCategoryRequest(BaseModel):
    canonical_product_ids: list[str]
    taxonomy_node_id: str


class BulkCategoryFailureDto(BaseModel):
    canonical_product_id: str
    error: str


class BulkSetCategoryResultDto(BaseModel):
    """Éxito PARCIAL explícito: qué entró y qué no. Abortar el lote entero por una fila obligaría
    al operador a rehacer la selección completa."""

    succeeded: list[str]
    failed: list[BulkCategoryFailureDto]
    succeeded_count: int
    failed_count: int
    category_name: str | None = None


@catalog_router.post(
    "/canonical-products/bulk-set-category", response_model=BulkSetCategoryResultDto
)
def bulk_set_canonical_category(
    body: BulkSetCategoryRequest,
    use_case: BulkSetCanonicalCategory = Depends(get_bulk_set_canonical_category),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> BulkSetCategoryResultDto:
    """Asigna una categoría a N canónicos (US-CP-L10).

    Cada asignación se audita POR SEPARADO: el SDD lo pide explícito, y una sola fila de "cambié
    40 productos" no permitiría reconstruir qué le pasó a uno en particular.
    """
    if not body.taxonomy_node_id.strip():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "taxonomy_node_id es obligatorio para fijar una categoría",
        )

    result = use_case.execute(
        market_id=MARKET,
        canonical_product_ids=body.canonical_product_ids,
        taxonomy_node_id=body.taxonomy_node_id,
    )

    for product_id in result.succeeded:
        audit.record(
            "canonical_product.set_category",
            "canonical_product",
            product_id,
            {
                "new_category": result.category_name,
                "method": "human",
                "origin": "bulk_admin",
            },
        )

    return BulkSetCategoryResultDto(
        succeeded=result.succeeded,
        failed=[BulkCategoryFailureDto(**asdict(f)) for f in result.failed],
        succeeded_count=len(result.succeeded),
        failed_count=len(result.failed),
        category_name=result.category_name,
    )


class CanonicalImageDto(BaseModel):
    """Una imagen de la galería. `position` 1 = la que ve el público."""

    id: str
    url: str
    position: int
    source_store_product_id: str | None = None
    is_primary: bool = False


class AddImageRequest(BaseModel):
    url: str = Field(min_length=1)
    source_store_product_id: str | None = None


class ReorderImagesRequest(BaseModel):
    """Lista COMPLETA de ids en el orden deseado. Un subconjunto dejaría imágenes sin posición."""

    image_ids: list[str]


@catalog_router.get(
    "/canonical-products/{canonical_product_id}/images",
    response_model=list[CanonicalImageDto],
)
def list_canonical_images(
    canonical_product_id: str,
    use_case: ListCanonicalImages = Depends(get_list_canonical_images),
) -> list[CanonicalImageDto]:
    """Galería ordenada (1ra, 2da, 3ra…) del canónico."""
    return [
        CanonicalImageDto(
            id=i.id,
            url=i.url,
            position=i.position,
            source_store_product_id=i.source_store_product_id,
            is_primary=i.is_primary,
        )
        for i in use_case.execute(canonical_product_id)
    ]


@catalog_router.post(
    "/canonical-products/{canonical_product_id}/images",
    response_model=CanonicalImageDto,
    status_code=status.HTTP_201_CREATED,
)
def add_canonical_image(
    canonical_product_id: str,
    body: AddImageRequest,
    use_case: AddCanonicalImage = Depends(get_add_canonical_image),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> CanonicalImageDto:
    """Agrega una imagen al FINAL de la galería (US-CP-D3/D4b).

    Si es la primera, pasa a ser la imagen pública. Tomarla de una tienda copia la URL: NO toca
    `store_product.image_url`, que es dato de la tienda.
    """
    try:
        image = use_case.execute(
            canonical_product_id=canonical_product_id,
            url=body.url,
            source_store_product_id=body.source_store_product_id,
        )
    except DuplicateImageError as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Esa imagen ya está en la galería."
        ) from exc

    if image is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto canónico no encontrado.")

    audit.record(
        "canonical_product.add_image",
        "canonical_product",
        canonical_product_id,
        {"position": image.position, "from_store": image.source_store_product_id is not None},
    )
    return CanonicalImageDto(
        id=image.id,
        url=image.url,
        position=image.position,
        source_store_product_id=image.source_store_product_id,
        is_primary=image.is_primary,
    )


@catalog_router.patch(
    "/canonical-products/{canonical_product_id}/images/order",
    response_model=list[CanonicalImageDto],
)
def reorder_canonical_images(
    canonical_product_id: str,
    body: ReorderImagesRequest,
    use_case: ReorderCanonicalImages = Depends(get_reorder_canonical_images),
    listing: ListCanonicalImages = Depends(get_list_canonical_images),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> list[CanonicalImageDto]:
    """Fija el orden (US-CP-D4b). La posición 1 pasa a ser la imagen pública del producto."""
    if not use_case.execute(
        canonical_product_id=canonical_product_id, image_ids=body.image_ids
    ):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "El orden debe incluir TODAS las imágenes de la galería, sin repetir.",
        )

    audit.record(
        "canonical_product.reorder_images",
        "canonical_product",
        canonical_product_id,
        {"count": len(body.image_ids)},
    )
    return [
        CanonicalImageDto(
            id=i.id,
            url=i.url,
            position=i.position,
            source_store_product_id=i.source_store_product_id,
            is_primary=i.is_primary,
        )
        for i in listing.execute(canonical_product_id)
    ]


@catalog_router.delete(
    "/canonical-products/{canonical_product_id}/images/{image_id}",
    response_model=list[CanonicalImageDto],
)
def remove_canonical_image(
    canonical_product_id: str,
    image_id: str,
    use_case: RemoveCanonicalImage = Depends(get_remove_canonical_image),
    listing: ListCanonicalImages = Depends(get_list_canonical_images),
    audit: AdminAuditRecorder = Depends(get_admin_audit),
) -> list[CanonicalImageDto]:
    """Quita una imagen y compacta las posiciones. Si era la primera, la siguiente pasa a ser
    la pública; si era la única, el producto queda sin imagen pública."""
    if not use_case.execute(canonical_product_id=canonical_product_id, image_id=image_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Imagen no encontrada.")

    audit.record(
        "canonical_product.remove_image", "canonical_product", canonical_product_id, {}
    )
    return [
        CanonicalImageDto(
            id=i.id,
            url=i.url,
            position=i.position,
            source_store_product_id=i.source_store_product_id,
            is_primary=i.is_primary,
        )
        for i in listing.execute(canonical_product_id)
    ]
