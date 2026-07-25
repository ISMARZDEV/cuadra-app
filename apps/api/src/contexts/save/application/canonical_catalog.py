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
from datetime import datetime, timezone

from ..domain.canonical_catalog import (
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
from ..domain.canonical_import import (
    ImportPreview,
    ImportRowInput,
    ImportRowIssue,
    ValidatedImportRow,
    find_intra_file_duplicates,
    normalize_brand,
    validate_import_row,
)
from ..domain.entities import CanonicalProduct
from ..domain.value_objects import Quantity, UnitMeasure


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

    def __init__(self, canonical_repo, catalog_repo) -> None:  # type: ignore[no-untyped-def]
        self._canonical = canonical_repo
        self._catalog = catalog_repo

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
            )
        )
        row = self._catalog.get_catalog_row(
            market_id=market_id, canonical_product_id=product_id
        )
        if row is None:  # pragma: no cover — sólo si el add falló silenciosamente
            raise RuntimeError(f"El canónico {product_id} no quedó persistido.")
        return row


class UpdateCanonicalProduct:
    """Edición básica del canónico (US-CP-L5/D2). El slug NO se regenera."""

    def __init__(self, canonical_repo, catalog_repo) -> None:  # type: ignore[no-untyped-def]
        self._canonical = canonical_repo
        self._catalog = catalog_repo

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
            clear_taxonomy=clear_taxonomy,
        )
        if updated is None:
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
        quality=row.quality,
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
        quality=row.quality,
    )
    return statuses, score
