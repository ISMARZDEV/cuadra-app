"""Admin Catálogo de Save (F5) — rutas admin de Productos Canónicos.

Router APARTE de `admin_save` y con capability PROPIA (`ADMIN_SAVE_CATALOG_OPS`): archivar
canónicos e importar en lote afecta el catálogo público y el histórico de matches, que es más
sensible que editar un provider. Mismo criterio que `admin_orchestration` (SDD §7).

Controller FINO (ADR 31): parsea, delega en el use case y arma el DTO. Cero SQLAlchemy acá — las
queries viven en `SqlAdminCanonicalCatalogRepository` y las reglas en `domain/canonical_catalog`.
Toda mutación escribe su fila de auditoría en la MISMA transacción del request (T2).

> **Archivar (US-CP-L6/D12) NO tiene endpoint a propósito.** `canonical_product` no tiene columna
> `archived_at` ni `deleted_at`. El SDD es explícito: *si el modelo no lo soporta, BLOQUEAR la
> acción, no improvisarla*. La UI la muestra deshabilitada con tooltip. Cuando exista la
> migración, la acción entra acá — con soft-delete, nunca con borrado físico.
"""
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from src.api.composition_root import (
    get_commit_canonical_import,
    get_create_canonical_product,
    get_get_canonical_product,
    get_list_canonical_duplicates,
    get_list_canonical_evidence,
    get_list_canonical_products,
    get_list_canonical_providers,
    get_preview_canonical_import,
    get_update_canonical_product,
)
from src.api.extensions.security import require_capability
from src.contexts.identity.domain.enums import CapabilityKey
from src.contexts.save.application.admin_audit_recorder import AdminAuditRecorder
from src.contexts.save.application.canonical_catalog import (
    CommitCanonicalImport,
    CreateCanonicalProduct,
    GetCanonicalProduct,
    InvalidMeasureError,
    ListCanonicalDuplicates,
    ListCanonicalEvidence,
    ListCanonicalProducts,
    ListCanonicalProviders,
    PreviewCanonicalImport,
    UpdateCanonicalProduct,
    derive_row_quality,
)
from src.contexts.save.domain.canonical_catalog import (
    CanonicalCatalogFilters,
    CanonicalCatalogRow,
    CanonicalQualityStatus,
)
from src.contexts.save.domain.canonical_import import ImportRowInput

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
    # ⚠️ `description` NO existe en el modelo — se omite del DTO en vez de inventarlo.
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
