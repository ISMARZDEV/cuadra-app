"""Use case RefreshCatalogPrices (§6.3): refresca precios de productos YA matcheados y —cuando
la cascada F2.0 está activa— ENRUTA los productos nuevos (desconocidos) al matching.

Recorre una `CatalogSource` (adapter por plataforma). Para un store_product ya conocido por
(provider, external_id) registra la observación (SCD-4 change-only). Para uno DESCONOCIDO:

- sin `matcher` (flag off, comportamiento legacy F1): lo cuenta como `unmatched` y lo descarta.
- con `matcher` (cascada F2.0 activa, `SAVE_MATCHING_CASCADE_ENABLED=true`): materializa el
  store_product (record_observation con canonical=None) para obtener su id y lo pasa a
  `MatchStoreProduct.execute` — la cascada decide el enlace (o lo manda a revisión). Se cuenta
  como `matched`.

El SCD-4 change-only y la escritura del FK canónico viven en la infra/cascada, no aquí.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol

from ..domain.classification import ClassifiableProduct
from ..domain.ports import CatalogSource, StoreProductRepository
from .classify_store_product import ClassifyStoreProduct
from .match_store_product import IncomingStoreProduct, MatchStoreProduct


class RelevanceGate(Protocol):
    """R2: ¿la categoría de origen de un producto DESCUBIERTO cae fuera del scope del catálogo?

    Definido aquí (no en domain/ports) para no acoplar la aplicación a la infra — duck-typing
    estructural, mismo patrón que `GreyBandJudge` en el matcher. La impl (`TaxonomyRelevanceGate`)
    resuelve el `source_category` a un top-level de taxonomía y lo contrasta con el footprint del
    catálogo. Conservador: solo `True` ante señal POSITIVA de fuera-de-footprint."""

    def is_off_scope(self, source_category: str) -> bool: ...


@dataclass(frozen=True, slots=True)
class RefreshResult:
    seen: int        # entradas devueltas por la fuente
    refreshed: int   # conocidas → observación registrada
    unmatched: int   # desconocidas SIN matcher → descartadas (legacy F1)
    matched: int = 0  # desconocidas enrutadas a la cascada F2.0 (matcher activo)
    discarded: int = 0  # desconocidas DESCARTADAS por el relevance gate (R2, fuera de scope)


class RefreshCatalogPrices:
    def __init__(
        self,
        store_repo: StoreProductRepository,
        matcher: MatchStoreProduct | None = None,
        classifier: ClassifyStoreProduct | None = None,
        relevance_gate: RelevanceGate | None = None,
    ) -> None:
        self._store_repo = store_repo
        self._matcher = matcher
        self._classifier = classifier
        self._relevance = relevance_gate

    def _classify(self, store_product_id: str, entry) -> None:  # type: ignore[no-untyped-def]
        """Enganche inline de la clasificación de categoría (save-category-classification). El
        clasificador es idempotente (no reclasifica lo ya `active`), así que correrlo en cada refresh
        es seguro. `None` = flag off → no-op (cero regresión)."""
        if self._classifier is None:
            return
        self._classifier.execute(
            ClassifiableProduct(
                ref_id=store_product_id,
                is_canonical=False,
                name=entry.name or "",
                brand=entry.brand or "",
                size_text=entry.size_text or "",
                # Etapa B: categoría de origen del adapter (VTEX/Magento/Bravo la pueblan) como
                # segunda señal cruzada con el nombre. "" si la fuente no la trae.
                source_category=" > ".join(entry.category_path),
            ),
            entry.market_id,
        )

    def execute(self, source: CatalogSource, captured_at: datetime | None = None) -> RefreshResult:
        ts = captured_at or datetime.now(timezone.utc)
        seen = refreshed = unmatched = matched = discarded = 0
        for entry in source.fetch():
            seen += 1
            if not self._store_repo.exists(entry.provider_id, entry.external_id):
                # R2: descarta EN DESCUBRIMIENTO el ruido fuera de scope (p.ej. Magento hace OR de
                # tokens y trae comida de perro por "arroz") ANTES de materializar/matchear. Solo
                # aplica a desconocidos; los conocidos ya ingeridos no se re-evalúan.
                if self._relevance is not None and self._relevance.is_off_scope(
                    " > ".join(entry.category_path)
                ):
                    discarded += 1
                    continue
                if self._matcher is None:
                    unmatched += 1  # legacy F1: se descarta, el matching es de F2
                    continue
                # Cascada F2.0 activa: materializa el store_product y enrútalo al matcher.
                store_product_id = self._store_repo.record_observation(
                    provider_id=entry.provider_id,
                    external_id=entry.external_id,
                    canonical_product_id=None,
                    price=entry.price,
                    captured_at=ts,
                    price_type=entry.price_type,
                    source=entry.source,
                    url=entry.url,
                    ean=entry.ean,
                    name=entry.name,
                    brand=entry.brand,
                    size_text=entry.size_text,
                    image_url=entry.image_url,
                    source_category=" > ".join(entry.category_path) or None,
                    source_ref=entry.source_ref,
                )
                self._matcher.execute(
                    IncomingStoreProduct(
                        store_product_id=store_product_id,
                        market_id=entry.market_id,
                        name=entry.name,
                        brand=entry.brand,
                        size=entry.size_text,
                        ean=entry.ean,
                        source_category=" > ".join(entry.category_path),  # Etapa C: señal de categoría
                    )
                )
                self._classify(store_product_id, entry)  # clasifica el nuevo store_product
                matched += 1
                continue
            store_product_id = self._store_repo.record_observation(
                provider_id=entry.provider_id,
                external_id=entry.external_id,
                canonical_product_id=None,
                price=entry.price,
                captured_at=ts,
                price_type=entry.price_type,
                source=entry.source,
                url=entry.url,
                ean=entry.ean,
                name=entry.name,
                brand=entry.brand,
                size_text=entry.size_text,
                image_url=entry.image_url,
                source_category=" > ".join(entry.category_path) or None,
                source_ref=entry.source_ref,
            )
            self._classify(store_product_id, entry)  # clasifica (idempotente) el conocido si falta
            refreshed += 1
        return RefreshResult(
            seen=seen, refreshed=refreshed, unmatched=unmatched, matched=matched, discarded=discarded
        )
