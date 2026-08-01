"""Acción en lote "Clasificar marcas" — el hermano de `BulkClassifyReview`, pero para la MARCA.

La ingesta ya rellena la marca de lo que entra (`RefreshCatalogPrices._with_resolved_brand`). Lo que
faltaba era dispararla BAJO DEMANDA sobre lo que el operador está mirando: si corrige un nombre, o
si el catálogo aprende una marca nueva, no puede quedarse esperando a la próxima corrida completa.

Estructura calcada de `BulkClassifyReview`: se itera sobre lo PEDIDO (una fila que ya no existe se
REPORTA en vez de desaparecer del resumen), cada fila corre en su propio SAVEPOINT, y el fallo de
una nunca arrastra ni silencia a las demás.

RECONOCE, NO INVENTA: la marca sale de `ResolveBrand`, que sólo acepta marcas ya presentes en el
catálogo. Como el valor devuelto siempre existe en `save.brand`, escribirlo nunca crea marcas
nuevas — la regla de no fabricar catálogo se mantiene sin esfuerzo.

NUNCA PISA una marca existente. Rellenar un hueco es reversible y barato; sobrescribir un dato que
alguien decidió, no.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Protocol

from ..domain.classification import ClassifiableProduct
from ..domain.ports.transaction import NestedTransactionScope


class BrandResolver(Protocol):
    def execute(self, product_name: str, market_id: str) -> str | None: ...


class ClassifiableProductsForMatches(Protocol):
    """Mismo puerto que consume `BulkClassifyReview` — el `ClassifiableProduct` ya trae nombre y
    marca actual, que es todo lo que hace falta acá."""

    def classifiable_for_matches(
        self, match_ids: list[str]
    ) -> list[tuple[str, ClassifiableProduct]]: ...


class StoreProductBrandWriter(Protocol):
    def set_brand(self, store_product_id: str, brand: str) -> None: ...


class CanonicalNameAndBrand(Protocol):
    def name_and_brand_of(self, canonical_product_id: str) -> tuple[str, str | None] | None:
        """`(nombre, marca actual)` del canónico, o `None` si ya no existe."""
        ...


class ProviderBrands(Protocol):
    def brands_by_canonical(self, canonical_ids: list[str]) -> dict[str, list[str]]:
        """Marcas de las tiendas enlazadas, TODO el lote en una query (nada de N+1)."""
        ...


class CanonicalBrandWriter(Protocol):
    def set_brand(self, canonical_product_id: str, brand: str) -> None: ...


# ------------------------------------------------------------------------------ resultado --


@dataclass(frozen=True, slots=True)
class BulkBrandRow:
    ref_id: str
    brand: str | None          # `None` = ninguna marca conocida aparece en el nombre
    source: str = "name"       # "provider" (observado) | "name" (deducido)


@dataclass(frozen=True, slots=True)
class BulkBrandFailure:
    ref_id: str
    error: str


@dataclass(frozen=True, slots=True)
class BulkBrandResult:
    """CUATRO estados, no tres.

    `skipped` (ya tenía marca) es un estado por derecho propio: sin él, un lote de 20 filas donde 15
    ya estaban resueltas se leería como "5 resueltas, 15 sin reconocer" — un éxito disfrazado de
    fracaso, y el operador saldría a buscar un problema que no existe.
    """

    rows: list[BulkBrandRow] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    failed: list[BulkBrandFailure] = field(default_factory=list)

    @property
    def resolved(self) -> int:
        return sum(1 for r in self.rows if r.brand is not None)

    @property
    def unresolved(self) -> int:
        return sum(1 for r in self.rows if r.brand is None)


def _has_brand(current: str | None) -> bool:
    return bool(current and current.strip())


# -------------------------------------------------------------------------- cola de revisión --


class BulkResolveMatchBrands:
    """Rellena `store_product.brand` de las filas seleccionadas de la cola.

    Acá no hay proveedores que consultar —la fila ES el producto de una tienda—, así que la marca
    sólo puede salir del nombre.
    """

    def __init__(
        self,
        *,
        scope: NestedTransactionScope,
        products: ClassifiableProductsForMatches,
        store_repo: StoreProductBrandWriter,
        resolver: BrandResolver,
        market_id: str,
    ) -> None:
        self._scope = scope
        self._products = products
        self._store_repo = store_repo
        self._resolver = resolver
        self._market_id = market_id

    def execute(self, match_ids: list[str]) -> BulkBrandResult:
        loaded = dict(self._products.classifiable_for_matches(match_ids))
        rows: list[BulkBrandRow] = []
        skipped: list[str] = []
        failed: list[BulkBrandFailure] = []

        for match_id in match_ids:
            product = loaded.get(match_id)
            if product is None:
                failed.append(BulkBrandFailure(match_id, "el producto ya no existe"))
                continue
            if _has_brand(product.brand):
                skipped.append(match_id)
                continue

            try:
                with self._scope.begin_nested():
                    brand = self._resolver.execute(product.name, self._market_id)
                    if brand is not None:
                        self._store_repo.set_brand(product.ref_id, brand)
            except Exception as exc:  # aislar el fallo de ESTA fila, nunca abortar el lote
                failed.append(BulkBrandFailure(match_id, str(exc)))
            else:
                rows.append(BulkBrandRow(match_id, brand))

        return BulkBrandResult(rows=rows, skipped=skipped, failed=failed)


# ---------------------------------------------------------------------- productos canónicos --


class BulkResolveCanonicalBrands:
    """Rellena la marca de los canónicos seleccionados.

    PRECEDENCIA: proveedor → nombre. Si alguna tienda enlazada ya trae marca, esa gana: es un dato
    OBSERVADO en la fuente, mientras que reconocerla en el nombre es una deducción. Preferir la
    deducción sobre la observación sería degradar el dato mejor que tenemos.
    """

    def __init__(
        self,
        *,
        scope: NestedTransactionScope,
        catalog: CanonicalNameAndBrand,
        provider_brands: ProviderBrands,
        writer: CanonicalBrandWriter,
        resolver: BrandResolver,
        market_id: str,
    ) -> None:
        self._scope = scope
        self._catalog = catalog
        self._provider_brands = provider_brands
        self._writer = writer
        self._resolver = resolver
        self._market_id = market_id

    @staticmethod
    def _from_providers(brands: list[str]) -> str | None:
        """La marca que más tiendas reportan. Empate → la primera alfabéticamente.

        El desempate no es un detalle: sin él, dos corridas sobre los mismos datos podrían asignar
        marcas distintas según el orden en que la base devolvió las filas.
        """
        usable = [b for b in brands if b and b.strip()]
        if not usable:
            return None
        counts = Counter(usable)
        return min(counts, key=lambda b: (-counts[b], b))

    def execute(self, canonical_product_ids: list[str]) -> BulkBrandResult:
        # UNA query para todo el lote: resolver los proveedores por canónico sería un N+1.
        provider_brands = self._provider_brands.brands_by_canonical(canonical_product_ids)
        rows: list[BulkBrandRow] = []
        skipped: list[str] = []
        failed: list[BulkBrandFailure] = []

        for canonical_id in canonical_product_ids:
            found = self._catalog.name_and_brand_of(canonical_id)
            if found is None:
                failed.append(BulkBrandFailure(canonical_id, "el producto ya no existe"))
                continue
            name, current = found
            if _has_brand(current):
                skipped.append(canonical_id)
                continue

            try:
                with self._scope.begin_nested():
                    brand = self._from_providers(provider_brands.get(canonical_id, []))
                    source = "provider"
                    if brand is None:
                        brand = self._resolver.execute(name, self._market_id)
                        source = "name"
                    if brand is not None:
                        self._writer.set_brand(canonical_id, brand)
            except Exception as exc:
                failed.append(BulkBrandFailure(canonical_id, str(exc)))
            else:
                rows.append(BulkBrandRow(canonical_id, brand, source))

        return BulkBrandResult(rows=rows, skipped=skipped, failed=failed)
