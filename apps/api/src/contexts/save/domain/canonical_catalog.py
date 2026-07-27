"""Catálogo canónico admin (F5) — read models + derivaciones PURAS (ADR 31).

Todo lo de acá se deriva a LECTURA sobre campos que ya existen. No hay columna de "calidad" ni
job que la calcule: fabricar un estado persistido sería inventar un dato que el pipeline no
produce. Mismo criterio que `derive_source_health` (Batch 3E).

Regla dura: estos badges los usa el operador para PRIORIZAR trabajo, así que ninguna señal puede
venir de IA generativa. Son reglas sobre campos, y por eso se prueban sin levantar la DB.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal
from enum import StrEnum

from .taxonomy import slugify

# La ingesta es diaria, pero marcar STALE a las 24h pintaría el catálogo entero de rojo ante
# cualquier corrida saltada. Una semana significa "ninguna corrida cubrió este producto", que sí
# es accionable para el operador.
PRICE_STALENESS_THRESHOLD = timedelta(days=7)

# Campos que componen la completitud (US-CP-L3). Explícito para que el denominador del porcentaje
# sea legible y no un `6` mágico.
_COMPLETENESS_FIELDS = 6


class CanonicalQualityStatus(StrEnum):
    """Estados operativos de un canónico. `COMPLETE` es EXCLUYENTE: o no falta nada, o se listan
    los huecos. Nunca las dos cosas."""

    COMPLETE = "complete"
    NO_IMAGE = "no_image"
    NO_CATEGORY = "no_category"
    NO_PROVIDERS = "no_providers"
    NO_QUALITY = "no_quality"
    STALE_PRICE = "stale_price"
    POSSIBLE_DUPLICATE = "possible_duplicate"


def derive_quality_statuses(
    *,
    image_url: str | None,
    category: str | None,
    matched_provider_count: int,
    quality: str | None,
    last_price_seen_at: datetime | None,
    now: datetime,
    possible_duplicate_count: int = 0,
    staleness_threshold: timedelta = PRICE_STALENESS_THRESHOLD,
) -> list[CanonicalQualityStatus]:
    """Lista de lo que le FALTA a un canónico; `[COMPLETE]` si no le falta nada."""
    gaps: list[CanonicalQualityStatus] = []

    if not image_url:
        gaps.append(CanonicalQualityStatus.NO_IMAGE)
    if not category:
        gaps.append(CanonicalQualityStatus.NO_CATEGORY)
    if matched_provider_count <= 0:
        gaps.append(CanonicalQualityStatus.NO_PROVIDERS)
    if not quality:
        gaps.append(CanonicalQualityStatus.NO_QUALITY)

    # Sin proveedores no hay precio que pueda estar viejo — `NO_PROVIDERS` ya lo dice todo y
    # apilar `STALE_PRICE` encima sería ruido que no cambia la acción del operador.
    if matched_provider_count > 0 and (
        last_price_seen_at is None or now - last_price_seen_at > staleness_threshold
    ):
        gaps.append(CanonicalQualityStatus.STALE_PRICE)

    # Un duplicado contamina las comparaciones (el peor caso de Save), así que un canónico
    # duplicado NUNCA está "completo" aunque tenga todos los campos llenos.
    if possible_duplicate_count > 0:
        gaps.append(CanonicalQualityStatus.POSSIBLE_DUPLICATE)

    return gaps or [CanonicalQualityStatus.COMPLETE]


def derive_completeness_score(
    *,
    image_url: str | None,
    category: str | None,
    matched_provider_count: int,
    brand: str,
    display_size: str | None,
    quality: str | None,
) -> int:
    """Porcentaje 0-100 de CAMPOS COMPLETOS (US-CP-L3).

    Deliberadamente NO incluye la señal de duplicado: el score mide completitud de campos, no
    salud global. Mezclarlos haría que el número dejara de significar lo que su nombre dice.
    """
    present = sum(
        [
            bool(image_url),
            bool(category),
            matched_provider_count > 0,
            bool(brand),
            bool(display_size),
            bool(quality),
        ]
    )
    return round(present / _COMPLETENESS_FIELDS * 100)


@dataclass(frozen=True, slots=True)
class CanonicalCatalogRow:
    """Read model de una fila del listado admin.

    Los campos derivados (`matched_provider_count`, `ean_reachable`, `possible_duplicate_count`,
    `last_price_seen_at`, `last_match_at`) los calcula el repositorio en SQL — no se persisten.
    """

    canonical_product_id: str
    slug: str
    name: str
    brand: str
    size_amount: Decimal
    size_measure: str
    display_size: str | None = None
    image_url: str | None = None
    # `category` es la HOJA (el dato específico: "Arroz"); `category_top` su ancestro de nivel 0
    # ("Despensa & Abarrotes"). La lista muestra las dos: el badge se colorea por el TOPE — el mapa
    # de colores del admin está cargado por slug de tope — y la hoja va debajo, para no perder
    # especificidad. Sin clasificar, las dos son None.
    category: str | None = None
    category_top: str | None = None
    quality: str | None = None
    taxonomy_node_id: str | None = None
    origin_run_id: str | None = None
    ean_reachable: bool = False
    matched_provider_count: int = 0
    possible_duplicate_count: int = 0
    last_price_seen_at: datetime | None = None
    last_match_at: datetime | None = None
    # ── F5 detalle: columnas de curación (migración 1b48d0f4dc93) ──
    description: str | None = None
    created_at: datetime | None = None
    # Nota INTERNA: viaja sólo en DTOs de admin. Nunca en un contrato público.
    internal_note: str | None = None
    # Soft-delete: `None` = activo. Archivado sigue existiendo, sólo deja de ser público.
    archived_at: datetime | None = None

    @property
    def is_archived(self) -> bool:
        return self.archived_at is not None

    @property
    def category_top_slug(self) -> str | None:
        """Slug del tope derivado en READ-TIME — `taxonomy_node` NO tiene columna `slug`.

        Mismo `slugify` que usa la cola de revisión (`product_match_repository`), así que un mismo
        tope produce el mismo slug en las dos pantallas y el badge sale del mismo color. Sin tope
        NO se inventa uno: el badge cae al neutro "Sin categoría".
        """
        return slugify(self.category_top) if self.category_top else None


@dataclass(frozen=True, slots=True)
class CanonicalCatalogPage:
    """Página + total REAL (contado sin `limit`/`offset`), para que la paginación no mienta."""

    rows: list[CanonicalCatalogRow]
    total: int


@dataclass(frozen=True, slots=True)
class CanonicalCatalogFilters:
    """Filtros del listado (US-CP-L2/L9). Value object para no arrastrar 8 argumentos sueltos
    por cada capa."""

    search: str | None = None
    brand_id: str | None = None
    taxonomy_node_id: str | None = None
    quality_status: CanonicalQualityStatus | None = None
    ean_reachable: bool | None = None
    min_provider_count: int | None = None
    updated_since: datetime | None = None
    # Por defecto el catálogo muestra sólo lo ACTIVO: archivar tiene que limpiar la vista de
    # trabajo. Pero el admin puede pedirlos a propósito — si no pudiera verlos, archivar sería
    # irreversible en la práctica y nadie podría restaurar nada.
    include_archived: bool = False


@dataclass(frozen=True, slots=True)
class CanonicalProviderPriceRow:
    """Una tienda que vende este canónico (US-CP-L4/D5). `price_minor` en minor units — el
    formateo es responsabilidad EXCLUSIVA de la UI (regla sagrada de Save)."""

    provider_id: str
    provider_name: str
    store_product_id: str
    price_minor: int
    currency: str
    provider_logo_url: str | None = None
    store_product_image_url: str | None = None
    # TODAS las que publica la tienda, en su orden (F5, tarea 9). Son las candidatas reales de la
    # galería: con una sola por tienda no hay galería que armar. La primera == `store_product_image_url`.
    store_product_image_urls: list[str] = field(default_factory=list)
    # Descripción que publica ESA tienda. Es una CANDIDATA: el operador elige cuál representa al
    # canónico (o la ajusta). Copiarla nunca modifica la de la tienda.
    store_product_description: str | None = None
    url: str | None = None
    last_seen_at: datetime | None = None
    price_type: str | None = None
    is_cheapest: bool = False


@dataclass(frozen=True, slots=True)
class CanonicalEvidenceRow:
    """Evidencia cruda que sostiene el canónico (US-CP-D8): qué dijo la tienda y cómo se enlazó.

    `match_method` distingue humano de automático. Ojo con la semántica de `llm`: significa que el
    juez EMITIÓ veredicto; si la API no respondió se registra `human`, no `llm`.
    """

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


@dataclass(frozen=True, slots=True)
class CanonicalDuplicateCandidate:
    """Canónico sospechoso de ser el MISMO producto (US-CP-D11).

    `signals` es la lista de razones ("ean_collision", "same_name_brand"). La colisión de EAN es
    la señal más fuerte — dos canónicos cuyos store_products comparten EAN normalizado son, casi
    con certeza, un duplicado. Sólo ALERTA: merge/split está fuera de alcance.
    """

    canonical_product_id: str
    slug: str
    name: str
    brand: str
    display_size: str | None = None
    category: str | None = None
    signals: list[str] = field(default_factory=list)

    @property
    def has_ean_collision(self) -> bool:
        return "ean_collision" in self.signals
