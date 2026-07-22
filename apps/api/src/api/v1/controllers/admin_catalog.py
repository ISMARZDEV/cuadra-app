"""Admin Catálogo de Save (F5) — rutas admin de Productos Canónicos.

Router APARTE de `admin_save` y con capability PROPIA (`ADMIN_SAVE_CATALOG_OPS`): archivar
canónicos e importar en lote afecta el catálogo público y el histórico de matches, que es más
sensible que editar un provider. Mismo criterio que `admin_orchestration` (SDD §7).

Controllers finos (ADR 31): parsean, delegan en el repo y construyen el DTO. Toda mutación
escribe su fila de auditoría en la MISMA transacción del request (T2).
"""
from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.composition_root import get_session
from src.api.extensions.security import require_capability
from src.contexts.identity.domain.enums import CapabilityKey
from src.contexts.save.infrastructure.models import (
    BrandModel,
    CanonicalProductModel,
    StoreProductModel,
    TaxonomyNodeModel,
)

catalog_router = APIRouter(
    prefix="/admin/save",
    tags=["admin-save-catalog"],
    dependencies=[Depends(require_capability(CapabilityKey.ADMIN_SAVE_CATALOG_OPS))],
)

MARKET = "DO"  # single-market, igual que el resto del admin


# ----------------------------------------------------------------------------------------- DTOs --

class AdminCanonicalProductRowDto(BaseModel):
    """Una fila del listado admin de canónicos (US-CP-L1/L3).

    Los campos marcados con ⚠️ son DERIVADOS de joins/subqueries, no columnas de
    `canonical_product`. Se calculan en la query SQL para que `total` sea correcto
    contra `limit`/`offset` reales.
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
    # ⚠️ `description` NO existe en el modelo — se omite del DTO.
    category: str | None = None
    # ⚠️ DERIVADO: ≥1 store_product enlazado con EAN.
    ean_reachable: bool = False
    # De qué corrida nació el canónico (F4 #4.5).
    origin_run_id: str | None = None
    # ⚠️ DERIVADO: COUNT(store_product) donde canonical_product_id = este id.
    matched_provider_count: int = 0
    # ⚠️ DERIVADO: MAX(store_product.last_seen_at).
    last_price_seen_at: str | None = None
    # ⚠️ DERIVADO: lista de estados de calidad (complete, no_image, no_category, etc.).
    quality_statuses: list[str] = []
    # ⚠️ DERIVADO: porcentaje 0-100 de completitud.
    completeness_score: int = 0


class AdminCanonicalProductListDto(BaseModel):
    """Envelope del listado admin con total para paginación."""

    rows: list[AdminCanonicalProductRowDto]
    total: int


# ----------------------------------------------------------------------------------- derivations --

def _derive_quality_statuses(
    *,
    image_url: str | None,
    category: str | None,
    matched_count: int,
    quality: str | None,
) -> list[str]:
    """Estados de calidad determinísticos (US-CP-L3/L9).

    Cada estado es una CONDICIÓN que falta. Un canónico sin ningún gap tiene `["complete"]`.
    No depende de IA generativa — son reglas puras sobre campos existentes.
    """
    gaps: list[str] = []
    if not image_url:
        gaps.append("no_image")
    if not category:
        gaps.append("no_category")
    if matched_count == 0:
        gaps.append("no_providers")
    if not quality:
        gaps.append("no_quality")
    return ["complete"] if not gaps else gaps


def _derive_completeness_score(
    *,
    image_url: str | None,
    category: str | None,
    matched_count: int,
    brand: str,
    display_size: str | None,
    quality: str | None,
) -> int:
    """Porcentaje de completitud (US-CP-L3). 6 campos ponderados igual (~16.6% cada uno)."""
    present = sum([
        bool(image_url),
        bool(category),
        matched_count > 0,
        bool(brand),
        bool(display_size),
        bool(quality),
    ])
    return round(present / 6 * 100)


# -------------------------------------------------------------------------------------- rutas --

@catalog_router.get("/canonical-products", response_model=AdminCanonicalProductListDto)
def list_canonical_products(
    search: str | None = Query(None, description="Search por nombre (ILIKE)"),
    brand_id: str | None = Query(None, description="Filtro por brand_id"),
    taxonomy_node_id: str | None = Query(None, description="Filtro por taxonomy_node_id"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
) -> AdminCanonicalProductListDto:
    """Listado admin de Productos Canónicos (US-CP-L1/L2/L3).

    Métricas derivadas (matched_provider_count, ean_reachable, quality_statuses, completeness_score)
    se calculan en SQL para que `total` sea correcto contra `limit`/`offset` reales.
    """
    # Subquery: conteo de providers por canónico
    provider_counts = (
        select(
            StoreProductModel.canonical_product_id,
            func.count(func.distinct(StoreProductModel.provider_id)).label("provider_count"),
            func.max(StoreProductModel.last_seen_at).label("last_seen"),
        )
        .where(StoreProductModel.canonical_product_id.isnot(None))
        .group_by(StoreProductModel.canonical_product_id)
        .subquery()
    )

    # Subquery: ean_reachable (al menos 1 store_product con EAN)
    ean_reachable = (
        select(StoreProductModel.canonical_product_id)
        .where(
            StoreProductModel.canonical_product_id.isnot(None),
            StoreProductModel.ean.isnot(None),
            StoreProductModel.ean != "",
        )
        .distinct()
        .subquery()
    )

    # Query principal con joins
    query = (
        select(
            CanonicalProductModel,
            BrandModel.name.label("brand_name"),
            TaxonomyNodeModel.name.label("category_name"),
            func.coalesce(provider_counts.c.provider_count, 0).label("provider_count"),
            provider_counts.c.last_seen.label("last_seen"),
            ean_reachable.c.canonical_product_id.isnot(None).label("has_ean"),
        )
        .outerjoin(BrandModel, CanonicalProductModel.brand_id == BrandModel.id)
        .outerjoin(TaxonomyNodeModel, CanonicalProductModel.taxonomy_node_id == TaxonomyNodeModel.id)
        .outerjoin(
            provider_counts,
            CanonicalProductModel.id == provider_counts.c.canonical_product_id,
        )
        .outerjoin(
            ean_reachable,
            CanonicalProductModel.id == ean_reachable.c.canonical_product_id,
        )
        .where(CanonicalProductModel.market_id == MARKET)
    )

    # Filtros
    if search:
        query = query.where(CanonicalProductModel.name.ilike(f"%{search}%"))
    if brand_id:
        query = query.where(CanonicalProductModel.brand_id == brand_id)
    if taxonomy_node_id:
        query = query.where(CanonicalProductModel.taxonomy_node_id == taxonomy_node_id)

    # Count total (sin limit/offset)
    count_query = select(func.count()).select_from(query.subquery())
    total = session.scalar(count_query) or 0

    # Apply pagination + ordering
    query = query.order_by(CanonicalProductModel.name).limit(limit).offset(offset)
    rows = session.execute(query).all()

    # Build DTOs
    dtos: list[AdminCanonicalProductRowDto] = []
    for row in rows:
        cp = row[0]  # CanonicalProductModel
        brand_name = row[1] or ""
        category_name = row[2]
        provider_count = row[3] or 0
        last_seen = row[4]
        has_ean = bool(row[5])

        statuses = _derive_quality_statuses(
            image_url=cp.image_url,
            category=category_name,
            matched_count=provider_count,
            quality=cp.quality,
        )
        score = _derive_completeness_score(
            image_url=cp.image_url,
            category=category_name,
            matched_count=provider_count,
            brand=brand_name,
            display_size=cp.display_size,
            quality=cp.quality,
        )

        dtos.append(AdminCanonicalProductRowDto(
            canonical_product_id=str(cp.id),
            slug=cp.slug,
            name=cp.name,
            brand=brand_name,
            display_size=cp.display_size,
            size_amount=cp.size_amount,
            size_measure=cp.size_measure,
            image_url=cp.image_url,
            category=category_name,
            ean_reachable=has_ean,
            origin_run_id=cp.origin_run_id,
            matched_provider_count=provider_count,
            last_price_seen_at=last_seen.isoformat() if last_seen else None,
            quality_statuses=statuses,
            completeness_score=score,
        ))

    return AdminCanonicalProductListDto(rows=dtos, total=total)


@catalog_router.get(
    "/canonical-products/{slug}", response_model=AdminCanonicalProductRowDto
)
def get_canonical_product_by_slug(
    slug: str,
    session: Session = Depends(get_session),
) -> AdminCanonicalProductRowDto:
    """Detalle admin de un canónico por slug (US-CP-D1 — placeholder hasta el detalle completo).

    Usa la misma query que el listado para derivar métricas consistentes.
    """
    # Subquery: conteo de providers
    provider_counts = (
        select(
            StoreProductModel.canonical_product_id,
            func.count(func.distinct(StoreProductModel.provider_id)).label("provider_count"),
            func.max(StoreProductModel.last_seen_at).label("last_seen"),
        )
        .where(StoreProductModel.canonical_product_id.isnot(None))
        .group_by(StoreProductModel.canonical_product_id)
        .subquery()
    )

    # Subquery: ean_reachable
    ean_reachable = (
        select(StoreProductModel.canonical_product_id)
        .where(
            StoreProductModel.canonical_product_id.isnot(None),
            StoreProductModel.ean.isnot(None),
            StoreProductModel.ean != "",
        )
        .distinct()
        .subquery()
    )

    row = session.execute(
        select(
            CanonicalProductModel,
            BrandModel.name.label("brand_name"),
            TaxonomyNodeModel.name.label("category_name"),
            func.coalesce(provider_counts.c.provider_count, 0).label("provider_count"),
            provider_counts.c.last_seen.label("last_seen"),
            ean_reachable.c.canonical_product_id.isnot(None).label("has_ean"),
        )
        .outerjoin(BrandModel, CanonicalProductModel.brand_id == BrandModel.id)
        .outerjoin(TaxonomyNodeModel, CanonicalProductModel.taxonomy_node_id == TaxonomyNodeModel.id)
        .outerjoin(
            provider_counts,
            CanonicalProductModel.id == provider_counts.c.canonical_product_id,
        )
        .outerjoin(
            ean_reachable,
            CanonicalProductModel.id == ean_reachable.c.canonical_product_id,
        )
        .where(
            CanonicalProductModel.market_id == MARKET,
            CanonicalProductModel.slug == slug,
        )
    ).first()

    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto canónico no encontrado.")

    cp = row[0]
    brand_name = row[1] or ""
    category_name = row[2]
    provider_count = row[3] or 0
    last_seen = row[4]
    has_ean = bool(row[5])

    statuses = _derive_quality_statuses(
        image_url=cp.image_url,
        category=category_name,
        matched_count=provider_count,
        quality=cp.quality,
    )
    score = _derive_completeness_score(
        image_url=cp.image_url,
        category=category_name,
        matched_count=provider_count,
        brand=brand_name,
        display_size=cp.display_size,
        quality=cp.quality,
    )

    return AdminCanonicalProductRowDto(
        canonical_product_id=str(cp.id),
        slug=cp.slug,
        name=cp.name,
        brand=brand_name,
        display_size=cp.display_size,
        size_amount=cp.size_amount,
        size_measure=cp.size_measure,
        image_url=cp.image_url,
        category=category_name,
        ean_reachable=has_ean,
        origin_run_id=cp.origin_run_id,
        matched_provider_count=provider_count,
        last_price_seen_at=last_seen.isoformat() if last_seen else None,
        quality_statuses=statuses,
        completeness_score=score,
    )
