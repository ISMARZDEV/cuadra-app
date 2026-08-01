"""Use cases del catálogo canónico admin (F5, SDD Sub-módulo List + Detail by Id).

El gate de capability vive en el controller, no acá (mismo criterio que `providers.py`). Lo que
vive acá es la ORQUESTACIÓN: qué se deriva, qué se persiste y en qué orden.

Regla que este módulo existe para sostener: **el id lo genera el use case**. La versión anterior
persistía y después re-consultaba por nombre con `ORDER BY id DESC` para "recuperar" lo que
acababa de crear — con UUID4 eso devuelve una fila ARBITRARIA cuando hay nombres repetidos, y
auditaba el target equivocado.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from src.shared.money import primary_currency_for_market

from ..domain.canonical_catalog import (
    CanonicalCatalogCursor,
    CanonicalCatalogFilters,
    CanonicalCatalogPage,
    CanonicalCatalogRow,
    CanonicalDuplicateCandidate,
    CanonicalEvidenceRow,
    CanonicalProviderPriceRow,
    CanonicalQualityStatus,
    derive_completeness_score,
    derive_quality_statuses,
)
from ..domain.canonical_bulk_category import (
    BulkCategoryAdvice,
    aggregate_category_suggestions,
)
from ..domain.canonical_image import CanonicalImage
from ..domain.canonical_history import (
    CanonicalHistoryRange,
    CanonicalPriceKpis,
    derive_price_kpis,
    range_since,
    window_with_carry_in,
)
from ..domain.canonical_import import (
    ImportPreview,
    ImportRowInput,
    ImportRowIssue,
    ValidatedImportRow,
    find_intra_file_duplicates,
    normalize_brand,
    validate_import_row,
)
from ..domain.classification import CategoryClassification
from ..domain.entities import CanonicalProduct
from ..domain.history import PricePoint
from ..domain.ports import CanonicalImageRepository, StoreProductRepository
from ..domain.value_objects import Quantity, UnitMeasure
from ..infrastructure.classification.lexicon import build_lexicon_index, lexicon_suggestions

# Mismo vocabulario que `SetProductCategory`: lo que decide un humano NUNCA se registra como
# decidido por el sistema.
HUMAN_CATEGORY_METHOD = "human"


class InvalidMeasureError(ValueError):
    """La unidad pedida no es `mass|volume|count`. El controller la mapea a 422."""


def _quantity(size_amount, size_measure: str) -> Quantity:  # type: ignore[no-untyped-def]
    try:
        measure = UnitMeasure(str(size_measure).strip().lower())
    except ValueError as exc:
        raise InvalidMeasureError(
            f"Unidad inválida: '{size_measure}'. Debe ser mass | volume | count."
        ) from exc
    from decimal import Decimal

    return Quantity(Decimal(str(size_amount)), measure)


# --------------------------------------------------------------------------------- lecturas --


class ListCanonicalProducts:
    """Listado paginado con métricas derivadas (US-CP-L1/L2/L3/L9)."""

    def __init__(self, catalog_repo) -> None:  # type: ignore[no-untyped-def]
        self._repo = catalog_repo

    def execute(
        self,
        *,
        market_id: str,
        filters: CanonicalCatalogFilters | None = None,
        limit: int = 50,
        offset: int = 0,
        sort: str = "name",
        now: datetime | None = None,
    ) -> CanonicalCatalogPage:
        return self._repo.list_catalog(
            market_id=market_id,
            filters=filters,
            limit=limit,
            offset=offset,
            sort=sort,
            now=now or datetime.now(timezone.utc),
        )


class GetCanonicalProductCursor:
    """Posición de un canónico dentro de un listado filtrado/ordenado, más sus vecinos.

    El use-case es orquestación pura: el SQL complejo vive en el repositorio.
    """

    def __init__(self, catalog_repo) -> None:  # type: ignore[no-untyped-def]
        self._repo = catalog_repo

    def execute(
        self,
        *,
        market_id: str,
        canonical_product_id: str,
        filters: CanonicalCatalogFilters | None = None,
        sort: str = "name",
    ) -> CanonicalCatalogCursor:
        return self._repo.get_catalog_cursor(
            market_id=market_id,
            canonical_product_id=canonical_product_id,
            filters=filters,
            sort=sort,
        )


class GetCanonicalProduct:
    """Una fila del catálogo por id o por slug (US-CP-D1)."""

    def __init__(self, catalog_repo) -> None:  # type: ignore[no-untyped-def]
        self._repo = catalog_repo

    def execute(
        self,
        *,
        market_id: str,
        canonical_product_id: str | None = None,
        slug: str | None = None,
    ) -> CanonicalCatalogRow | None:
        return self._repo.get_catalog_row(
            market_id=market_id, canonical_product_id=canonical_product_id, slug=slug
        )


class ListCanonicalProviders:
    """Tiendas que venden el canónico, más barata primero (US-CP-L4/D5)."""

    def __init__(self, catalog_repo) -> None:  # type: ignore[no-untyped-def]
        self._repo = catalog_repo

    def execute(self, canonical_product_id: str) -> list[CanonicalProviderPriceRow]:
        return self._repo.list_providers(canonical_product_id)


class ListCanonicalEvidence:
    """Datos crudos por tienda + método/confianza del match (US-CP-D8). Sólo lectura."""

    def __init__(self, catalog_repo) -> None:  # type: ignore[no-untyped-def]
        self._repo = catalog_repo

    def execute(self, canonical_product_id: str) -> list[CanonicalEvidenceRow]:
        return self._repo.list_evidence(canonical_product_id)


class ListCanonicalDuplicates:
    """Candidatos a duplicado, colisión de EAN primero (US-CP-D11). Sólo ALERTA."""

    def __init__(self, catalog_repo) -> None:  # type: ignore[no-untyped-def]
        self._repo = catalog_repo

    def execute(
        self, *, canonical_product_id: str, market_id: str, limit: int = 20
    ) -> list[CanonicalDuplicateCandidate]:
        return self._repo.list_duplicate_candidates(
            canonical_product_id=canonical_product_id, market_id=market_id, limit=limit
        )


# -------------------------------------------------------------------------------- mutaciones --


class CreateCanonicalProduct:
    """Alta manual de un canónico (US-CP-L7).

    El id se genera ACÁ y se relee POR ESE ID. Nace con `matched_provider_count = 0` y
    `origin_run_id = None` — no vino de ninguna corrida, y estamparle una lo contaría en un total
    ajeno (F4 hace `count WHERE origin_run_id = X`).
    """

    def __init__(self, canonical_repo, catalog_repo, embedder=None) -> None:  # type: ignore[no-untyped-def]
        self._canonical = canonical_repo
        self._catalog = catalog_repo
        # US-CP-L14. Opcional a propósito, como los colaboradores de `CreateCanonicalAndLink`: sin
        # él el canónico nace con `embedding` NULL, que es justo lo que el backfill busca. Ningún
        # vector vale bloquear un alta.
        self._embedder = embedder

    def execute(
        self,
        *,
        market_id: str,
        name: str,
        size_amount,  # type: ignore[no-untyped-def]
        size_measure: str,
        brand: str | None = None,
        quality: str | None = None,
        display_size: str | None = None,
        image_url: str | None = None,
        taxonomy_node_id: str | None = None,
        description: str | None = None,
    ) -> CanonicalCatalogRow:
        product_id = str(uuid.uuid4())
        self._canonical.add(
            CanonicalProduct(
                id=product_id,
                name=name.strip(),
                brand=normalize_brand(brand),
                quantity=_quantity(size_amount, size_measure),
                taxonomy_node_id=taxonomy_node_id or "",
                market_id=market_id,
                quality=quality or None,
                display_size=display_size or None,
                image_url=image_url or None,
                description=description or None,
            )
        )
        if self._embedder is not None:
            self._embedder.execute(product_id)
        row = self._catalog.get_catalog_row(
            market_id=market_id, canonical_product_id=product_id
        )
        if row is None:  # pragma: no cover — sólo si el add falló silenciosamente
            raise RuntimeError(f"El canónico {product_id} no quedó persistido.")
        return row


class UpdateCanonicalProduct:
    """Edición básica del canónico (US-CP-L5/D2). El slug NO se regenera.

    Si la edición cambió el texto que se embebe, el repo ya dejó el `embedding` en NULL (ver
    `SqlCanonicalProductRepository._embedding_text`) — un vector que describe al producto viejo es
    PEOR que ninguno. Este use case sólo cierra la ventana re-embebiendo en el acto; sin embedder
    inyectado el NULL sobrevive y lo levanta el backfill.
    """

    def __init__(self, canonical_repo, catalog_repo, embedder=None) -> None:  # type: ignore[no-untyped-def]
        self._canonical = canonical_repo
        self._catalog = catalog_repo
        self._embedder = embedder

    def execute(
        self,
        *,
        market_id: str,
        canonical_product_id: str,
        name: str | None = None,
        brand: str | None = None,
        size_amount=None,  # type: ignore[no-untyped-def]
        size_measure: str | None = None,
        quality: str | None = None,
        display_size: str | None = None,
        image_url: str | None = None,
        taxonomy_node_id: str | None = None,
        description: str | None = None,
        clear_taxonomy: bool = False,
    ) -> CanonicalCatalogRow | None:
        quantity = None
        if size_amount is not None and size_measure is not None:
            quantity = _quantity(size_amount, size_measure)

        updated = self._canonical.update_attributes(
            canonical_product_id,
            name=name.strip() if name is not None else None,
            brand=normalize_brand(brand) if brand is not None else None,
            quantity=quantity,
            quality=quality,
            display_size=display_size,
            image_url=image_url,
            taxonomy_node_id=taxonomy_node_id,
            description=description,
            clear_taxonomy=clear_taxonomy,
        )
        if updated is None:
            return None
        if self._embedder is not None:
            self._embedder.execute(canonical_product_id)
        return self._catalog.get_catalog_row(
            market_id=market_id, canonical_product_id=canonical_product_id
        )


class ArchiveCanonicalProduct:
    """Archivar / restaurar un canónico (US-CP-L6/D12).

    SOFT-delete deliberado: archivar saca el producto del sitio público pero NO borra la fila ni
    desenlaza las tiendas. El histórico de precios, los `product_match` y el slug sobreviven — un
    borrado real dejaría `store_product.canonical_product_id` colgando y rompería comparaciones ya
    publicadas. Restaurar es la operación inversa exacta.
    """

    def __init__(self, canonical_repo, catalog_repo) -> None:  # type: ignore[no-untyped-def]
        self._canonical = canonical_repo
        self._catalog = catalog_repo

    def execute(
        self, *, market_id: str, canonical_product_id: str, archived: bool
    ) -> CanonicalCatalogRow | None:
        result = self._canonical.set_archived(canonical_product_id, archived=archived)
        if result is False:
            return None
        return self._catalog.get_catalog_row(
            market_id=market_id, canonical_product_id=canonical_product_id
        )


class UpdateInternalNote:
    """Nota interna del operador (US-CP-D10).

    Nunca sale por un DTO público: es coordinación del equipo sobre un producto, no contenido.
    """

    def __init__(self, canonical_repo, catalog_repo) -> None:  # type: ignore[no-untyped-def]
        self._canonical = canonical_repo
        self._catalog = catalog_repo

    def execute(
        self, *, market_id: str, canonical_product_id: str, note: str | None
    ) -> CanonicalCatalogRow | None:
        if not self._canonical.set_internal_note(canonical_product_id, note):
            return None
        return self._catalog.get_catalog_row(
            market_id=market_id, canonical_product_id=canonical_product_id
        )


# ------------------------------------------------------------------------------ importación --


class PreviewCanonicalImport:
    """Paso 2 del import (US-CP-L8): validar y avisar duplicados SIN persistir nada.

    Dos fuentes de duplicado: dentro del propio archivo, y contra el catálogo existente. La
    segunda es la que evita que una importación repetida cree el catálogo dos veces.
    """

    def __init__(self, catalog_repo) -> None:  # type: ignore[no-untyped-def]
        self._catalog = catalog_repo

    def execute(self, *, market_id: str, rows: list[ImportRowInput]) -> ImportPreview:
        valid: list[ValidatedImportRow] = []
        invalid: list[ImportRowIssue] = []
        for index, raw in enumerate(rows):
            ok, issue = validate_import_row(index, raw)
            if ok is not None:
                valid.append(ok)
            elif issue is not None:
                invalid.append(issue)

        warnings = find_intra_file_duplicates(valid)

        existing = self._catalog.find_existing_identities(
            market_id=market_id, names=[r.name for r in valid]
        )
        warnings.extend(
            ImportRowIssue(
                r.row_index,
                f"Ya existe un canónico con ese nombre, marca y tamaño: '{r.name}'.",
            )
            for r in valid
            if r.dedup_key in existing
        )
        warnings.sort(key=lambda w: w.row_index)
        return ImportPreview(valid_rows=valid, invalid_rows=invalid, warnings=warnings)


class ImportResult:
    """Resultado del commit: qué entró, qué no y por qué."""

    def __init__(
        self,
        imported: list[CanonicalCatalogRow],
        errors: list[ImportRowIssue],
        warnings: list[ImportRowIssue],
    ) -> None:
        self.imported = imported
        self.errors = errors
        self.warnings = warnings

    @property
    def imported_count(self) -> int:
        return len(self.imported)

    @property
    def error_count(self) -> int:
        return len(self.errors)


class CommitCanonicalImport:
    """Paso 3 del import (US-CP-L8): persistir las filas válidas.

    Transaccional POR FILA vía savepoint: una fila que revienta en la base no puede arrastrar a
    las siguientes. Sin el savepoint, un `flush()` fallido deja la sesión en estado inválido y
    TODO lo que venga después falla en cascada — el error de una fila se convertiría en la
    pérdida de la importación completa.
    """

    def __init__(self, canonical_repo, catalog_repo, session) -> None:  # type: ignore[no-untyped-def]
        self._canonical = canonical_repo
        self._catalog = catalog_repo
        self._s = session

    def execute(self, *, market_id: str, rows: list[ImportRowInput]) -> ImportResult:
        preview = PreviewCanonicalImport(self._catalog).execute(market_id=market_id, rows=rows)
        imported: list[CanonicalCatalogRow] = []
        errors: list[ImportRowIssue] = list(preview.invalid_rows)

        for row in preview.valid_rows:
            product_id = str(uuid.uuid4())
            try:
                with self._s.begin_nested():
                    self._canonical.add(
                        CanonicalProduct(
                            id=product_id,
                            name=row.name,
                            brand=row.brand,
                            quantity=Quantity(
                                row.size_amount, UnitMeasure(row.size_measure)
                            ),
                            taxonomy_node_id="",
                            market_id=market_id,
                            quality=row.quality,
                            display_size=row.display_size,
                            image_url=row.image_url,
                        )
                    )
            except Exception:  # noqa: BLE001 — la fila se reporta, la importación sigue
                errors.append(
                    ImportRowIssue(
                        row.row_index,
                        f"No se pudo crear el canónico '{row.name}'. Revisá la fila.",
                    )
                )
                continue

            created = self._catalog.get_catalog_row(
                market_id=market_id, canonical_product_id=product_id
            )
            if created is not None:
                imported.append(created)

        errors.sort(key=lambda e: e.row_index)
        return ImportResult(imported=imported, errors=errors, warnings=preview.warnings)


# -------------------------------------------------------------------------------- derivación --


def derive_row_quality(
    row: CanonicalCatalogRow, *, now: datetime | None = None
) -> tuple[list[CanonicalQualityStatus], int]:
    """`(estados, completitud)` de una fila. Envuelve las reglas puras del dominio para que el
    controller no tenga que conocer los argumentos de cada una."""
    now = now or datetime.now(timezone.utc)
    statuses = derive_quality_statuses(
        image_url=row.image_url,
        category=row.category,
        matched_provider_count=row.matched_provider_count,
        last_price_seen_at=row.last_price_seen_at,
        possible_duplicate_count=row.possible_duplicate_count,
        now=now,
    )
    score = derive_completeness_score(
        image_url=row.image_url,
        category=row.category,
        matched_provider_count=row.matched_provider_count,
        brand=row.brand,
        display_size=row.display_size,
    )
    return statuses, score


class ListCanonicalAuditLog:
    """Actividad del canónico (US-CP-D9): quién cambió qué y cuándo.

    Lee del audit log append-only que ya escribe cada mutación en el borde del controller (T2).
    No hay una tabla de historial propia del producto — hacerla sería duplicar la fuente de verdad.
    """

    def __init__(self, audit_repo) -> None:  # type: ignore[no-untyped-def]
        self._repo = audit_repo

    def execute(self, *, market_id: str, canonical_product_id: str, limit: int = 50):  # type: ignore[no-untyped-def]
        return self._repo.list_recent(
            market_id=market_id,
            target_type="canonical_product",
            target_id=canonical_product_id,
            limit=limit,
        )


# --------------------------------------------------------------------------------- histórico --


class MixedCurrencyHistoryError(ValueError):
    """El histórico trae más de una moneda. Regla SAGRADA de Save: jamás mezclarlas en un chart —
    dos series en monedas distintas sobre el mismo eje es una comparación falsa."""


class GetCanonicalPriceHistory:
    """Histórico + KPIs del canónico para el detalle admin (US-CP-D6/D7).

    Rangos `15d|1m|3m|6m|1y|all` — el histórico PÚBLICO sólo soporta `1m/3m/all`, y no se toca
    para no cambiar su contrato. El baseline carry-in se comporta igual que el público: si una
    tienda no cambió su precio dentro del rango, su línea arranca con el precio que ya venía
    vigente en vez de aparecer vacía.
    """

    def __init__(self, catalog_repo, store_repo) -> None:  # type: ignore[no-untyped-def]
        self._catalog = catalog_repo
        self._store = store_repo

    def execute(
        self,
        *,
        market_id: str,
        canonical_product_id: str,
        range_: CanonicalHistoryRange = CanonicalHistoryRange.ALL,
        provider_ids: list[str] | None = None,
        now: datetime | None = None,
    ) -> CanonicalPriceHistory | None:
        row = self._catalog.get_catalog_row(
            market_id=market_id, canonical_product_id=canonical_product_id
        )
        if row is None:
            return None

        now = now or datetime.now(timezone.utc)
        since = range_since(range_, now=now)

        by_provider: dict[str, list[PricePoint]] = {}
        wanted = set(provider_ids) if provider_ids else None
        for point in self._store.list_price_history(canonical_product_id):
            if wanted is not None and point.provider_id not in wanted:
                continue
            by_provider.setdefault(point.provider_id, []).append(point)

        series = {
            pid: window_with_carry_in(points, since=since)
            for pid, points in by_provider.items()
        }

        currencies = {p.price.currency.code for pts in series.values() for p in pts}
        if len(currencies) > 1:
            raise MixedCurrencyHistoryError(
                f"Histórico con monedas mezcladas: {sorted(currencies)}"
            )

        return CanonicalPriceHistory(
            canonical_product_id=row.canonical_product_id,
            name=row.name,
            currency=next(iter(currencies), primary_currency_for_market(market_id)),
            range=range_.value,
            series=series,
            kpis=derive_price_kpis(series, now=now, since=since),
        )


@dataclass(frozen=True, slots=True)
class CanonicalPriceHistory:
    """Resultado del histórico admin: las series por tienda + los KPIs del rango."""

    canonical_product_id: str
    name: str
    currency: str
    range: str
    series: dict[str, list[PricePoint]]
    kpis: CanonicalPriceKpis


# --------------------------------------------------------------------------------------- slug --


class PreviewCanonicalSlug:
    """Qué slug tendría el canónico si se regenerara (US-CP-D2b). No persiste nada.

    Existe como paso aparte porque la regla del slug vive en el DOMINIO (`product_slug` + la
    unicidad por mercado): replicarla en el cliente para "previsualizar" la duplicaría en dos
    lenguajes y las dos copias divergirían al primer cambio.
    """

    def __init__(self, canonical_repo) -> None:  # type: ignore[no-untyped-def]
        self._repo = canonical_repo

    def execute(self, canonical_product_id: str) -> tuple[str, str] | None:
        return self._repo.slug_candidate(canonical_product_id)


class RegenerateCanonicalSlug:
    """Regenera el slug público. ACCIÓN EXPLÍCITA — jamás un efecto de editar el nombre."""

    def __init__(self, canonical_repo, catalog_repo) -> None:  # type: ignore[no-untyped-def]
        self._canonical = canonical_repo
        self._catalog = catalog_repo

    def execute(
        self, *, market_id: str, canonical_product_id: str
    ) -> tuple[CanonicalCatalogRow, str, str] | None:
        result = self._canonical.regenerate_slug(canonical_product_id)
        if result is None:
            return None
        old, new = result
        row = self._catalog.get_catalog_row(
            market_id=market_id, canonical_product_id=canonical_product_id
        )
        if row is None:  # pragma: no cover
            return None
        return row, old, new


# ---------------------------------------------------------------------------------- categoría --


class SuggestCanonicalCategories:
    """Hojas sugeridas para el canónico (US-CP-D2c).

    Reusa el LÉXICO del clasificador ya construido — no diseña otra cascada. Corre sin embedder
    ni juez a propósito: BGE-M3 vive en el grupo `ingestion` y NO está en la imagen de la API
    (importarlo la reventaría al arrancar en producción). El léxico es determinista y no necesita
    modelo, que es justamente por lo que el clasificador funciona del lado de la API.

    Sin señal léxica devuelve `[]`: no inventar categoría es regla sagrada del módulo, y el árbol
    completo queda como fallback.
    """

    def __init__(self, catalog_repo, taxonomy_repo) -> None:  # type: ignore[no-untyped-def]
        self._catalog = catalog_repo
        self._taxonomy = taxonomy_repo

    def execute(
        self, *, market_id: str, canonical_product_id: str, limit: int = 5
    ) -> list[tuple[str, str, list[str], str]]:
        """`[(taxonomy_node_id, nombre_hoja, tokens, señal)]`, más evidencia primero."""
        row = self._catalog.get_catalog_row(
            market_id=market_id, canonical_product_id=canonical_product_id
        )
        if row is None:
            return []

        tree = self._taxonomy.list_tree(market_id)
        leaves = [(child.id, child.name) for root in tree for child in root.children]
        names = dict(leaves)

        return [
            (s.taxonomy_node_id, names.get(s.taxonomy_node_id, ""), s.matched_tokens, s.signal)
            for s in lexicon_suggestions(
                row.name, build_lexicon_index(leaves), brand=row.brand, limit=limit
            )
        ]


class SetCanonicalCategory:
    """Asigna la categoría del canónico y REGISTRA que la decidió una persona (US-CP-D2c).

    Escribe en dos lugares a propósito y no es duplicación:
    - `canonical_product.taxonomy_node_id` es lo que leen el listado y el sitio público.
    - `category_classification` con `method="human"` es el REGISTRO de quién decidió. Sin él, el
      trabajo manual se contaría como acierto del clasificador y la métrica de auto-clasificación
      dejaría de medir lo único que importa: si el pipeline se sostiene SIN nosotros.
    """

    def __init__(self, canonical_repo, catalog_repo, classifications) -> None:  # type: ignore[no-untyped-def]
        self._canonical = canonical_repo
        self._catalog = catalog_repo
        self._classifications = classifications

    def execute(
        self, *, market_id: str, canonical_product_id: str, taxonomy_node_id: str
    ) -> tuple[CanonicalCatalogRow, str | None] | None:
        if not taxonomy_node_id.strip():
            # "Sin categoría" NO se persiste como clasificación: la AUSENCIA de fila activa ya
            # significa eso. Una fila `active` apuntando a nada afirmaría que sí sabemos.
            raise ValueError("taxonomy_node_id es obligatorio para fijar una categoría")

        previous = self._catalog.get_catalog_row(
            market_id=market_id, canonical_product_id=canonical_product_id
        )
        if previous is None:
            return None

        updated = self._canonical.update_attributes(
            canonical_product_id, taxonomy_node_id=taxonomy_node_id
        )
        if updated is None:
            return None

        self._classifications.save_active(
            CategoryClassification(
                id=str(uuid.uuid4()),
                store_product_id=None,
                canonical_product_id=canonical_product_id,
                taxonomy_node_id=taxonomy_node_id,
                confidence=1.0,
                method=HUMAN_CATEGORY_METHOD,
                status="active",
            )
        )

        row = self._catalog.get_catalog_row(
            market_id=market_id, canonical_product_id=canonical_product_id
        )
        return (row, previous.category) if row is not None else None


class SuggestBulkCategories:
    """Sugerencias sobre un CONJUNTO de canónicos + advertencia de heterogeneidad (US-CP-L10).

    El índice léxico se arma UNA vez para todo el lote, no por producto: son 120 hojas y un dict,
    y rearmarlo N veces sería trabajo idéntico repetido.
    """

    def __init__(self, catalog_repo, taxonomy_repo) -> None:  # type: ignore[no-untyped-def]
        self._catalog = catalog_repo
        self._taxonomy = taxonomy_repo

    def execute(
        self, *, market_id: str, canonical_product_ids: list[str], limit: int = 5
    ) -> tuple[BulkCategoryAdvice, dict[str, str]]:
        """`(consejo del lote, nombres de las hojas)`."""
        tree = self._taxonomy.list_tree(market_id)
        leaves = [(child.id, child.name) for root in tree for child in root.children]
        index = build_lexicon_index(leaves)

        per_product: dict[str, list] = {}
        for product_id in canonical_product_ids:
            row = self._catalog.get_catalog_row(
                market_id=market_id, canonical_product_id=product_id
            )
            # Un id inexistente no rompe el lote: simplemente no aporta señal.
            per_product[product_id] = (
                lexicon_suggestions(row.name, index, brand=row.brand, limit=limit)
                if row is not None
                else []
            )

        return aggregate_category_suggestions(per_product, limit=limit), dict(leaves)


@dataclass(frozen=True, slots=True)
class BulkCategoryFailure:
    canonical_product_id: str
    error: str


@dataclass(frozen=True, slots=True)
class BulkCategoryResult:
    succeeded: list[str] = field(default_factory=list)
    failed: list[BulkCategoryFailure] = field(default_factory=list)
    category_name: str | None = None


class BulkSetCanonicalCategory:
    """Asigna una categoría a N canónicos (US-CP-L10).

    Cada fila va en su propio SAVEPOINT y se registra INDIVIDUALMENTE como decisión humana: el
    SDD lo pide explícito. Un id inexistente no puede arrastrar ni silenciar a los demás — se
    reporta éxito parcial, que es lo que el operador necesita para saber qué reintentar.
    """

    def __init__(self, setter: SetCanonicalCategory, session) -> None:  # type: ignore[no-untyped-def]
        self._setter = setter
        self._s = session

    def execute(
        self, *, market_id: str, canonical_product_ids: list[str], taxonomy_node_id: str
    ) -> BulkCategoryResult:
        succeeded: list[str] = []
        failed: list[BulkCategoryFailure] = []
        category_name: str | None = None

        for product_id in canonical_product_ids:
            try:
                with self._s.begin_nested():
                    result = self._setter.execute(
                        market_id=market_id,
                        canonical_product_id=product_id,
                        taxonomy_node_id=taxonomy_node_id,
                    )
                if result is None:
                    failed.append(
                        BulkCategoryFailure(product_id, "Producto canónico no encontrado.")
                    )
                    continue
                row, _ = result
                category_name = row.category
                succeeded.append(product_id)
            except Exception:  # noqa: BLE001 — la fila se reporta, el lote sigue
                failed.append(
                    BulkCategoryFailure(product_id, "No se pudo asignar la categoría.")
                )

        return BulkCategoryResult(
            succeeded=succeeded, failed=failed, category_name=category_name
        )


# ---------------------------------------------------------------------------------- galería --


class ListCanonicalImages:
    """Galería ordenada del canónico (F5)."""

    def __init__(self, image_repo: CanonicalImageRepository) -> None:
        self._repo = image_repo

    def execute(self, canonical_product_id: str) -> list[CanonicalImage]:
        return self._repo.list_images(canonical_product_id)


class ListStoreProductImages:
    """Galería que publicó la TIENDA para un `store_product` (lightbox de la Cola de revisión).

    Distinta de `ListCanonicalImages`: aquélla es la galería CURADA del canónico; ésta es lo que
    la tienda publica, sin curar. El operador la abre para decidir si el match propuesto es el
    mismo producto, y una sola foto muchas veces no alcanza para decidirlo.
    """

    def __init__(self, store_product_repo: StoreProductRepository) -> None:
        self._repo = store_product_repo

    def execute(self, store_product_id: str) -> list[str]:
        return self._repo.list_store_images(store_product_id)


class AddCanonicalImage:
    """Agrega una imagen AL FINAL de la galería. El orden lo decide el operador después.

    Tomarla de una tienda copia la URL al canónico y NO toca `store_product.image_url`: esa
    imagen es dato de la tienda, y el canónico sólo elige cuál lo representa.
    """

    def __init__(self, image_repo: CanonicalImageRepository) -> None:
        self._repo = image_repo

    def execute(
        self,
        *,
        canonical_product_id: str,
        url: str,
        source_store_product_id: str | None = None,
    ) -> CanonicalImage | None:
        return self._repo.add_image(
            canonical_product_id,
            url=url,
            source_store_product_id=source_store_product_id,
        )


class ReorderCanonicalImages:
    """Fija el orden de la galería. La posición 1 pasa a ser la imagen pública."""

    def __init__(self, image_repo: CanonicalImageRepository) -> None:
        self._repo = image_repo

    def execute(self, *, canonical_product_id: str, image_ids: list[str]) -> bool:
        return self._repo.reorder(canonical_product_id, image_ids)


class RemoveCanonicalImage:
    """Quita una imagen y compacta el resto. Si era la primera, la siguiente pasa a ser pública."""

    def __init__(self, image_repo: CanonicalImageRepository) -> None:
        self._repo = image_repo

    def execute(self, *, canonical_product_id: str, image_id: str) -> bool:
        return self._repo.remove_image(canonical_product_id, image_id)
