"""Use case RefreshCatalogPrices (§6.3): refresca precios de productos YA matcheados y —cuando
la cascada F2.0 está activa— ENRUTA los productos nuevos (desconocidos) al matching.

Recorre una `CatalogSource` (adapter por plataforma). Para un store_product ya conocido por
(provider, external_id) registra la observación (SCD-4 change-only). Para uno DESCONOCIDO:

- sin `matcher` (flag off, comportamiento legacy F1): lo cuenta como `unmatched` y lo descarta.
- con `matcher` (cascada F2.0 activa, `SAVE_MATCHING_CASCADE_ENABLED=true`): materializa el
  store_product (record_observation con canonical=None) para obtener su id y lo pasa a
  `MatchStoreProduct.execute` — la cascada decide el enlace (o lo manda a revisión). Se cuenta
  como `matched`, y su DESENLACE (`auto_linked` / `queued_for_review`) se lee del
  `ProductMatch.status` que devuelve la cascada.

El SCD-4 change-only y la escritura del FK canónico viven en la infra/cascada, no aquí.

Lo que este use-case NO puede reportar: los canónicos nuevos. Nada en la corrida los crea —
`CreateCanonicalAndLink` solo se invoca desde el admin (un humano resolviendo la cola) o desde
`seeds/bootstrap_canonicals`. "Canónicos de esta corrida" es, por definición, una pregunta que se
responde DESPUÉS y por join contra lo que la corrida encoló; vive en la proyección de runs, no acá.
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
    """R2: ¿un producto DESCUBIERTO cae fuera del scope del catálogo?

    Definido aquí (no en domain/ports) para no acoplar la aplicación a la infra — duck-typing
    estructural, mismo patrón que `GreyBandJudge` en el matcher. La impl (`TaxonomyRelevanceGate`)
    CLASIFICA el producto a nuestra taxonomía (por nombre + categoría de origen) y contrasta la raíz
    con el footprint del catálogo. Conservador: solo `True` ante clasificación CONFIADA fuera de él."""

    def is_off_scope(self, product: ClassifiableProduct) -> bool: ...


@dataclass(frozen=True, slots=True)
class RefreshResult:
    seen: int        # entradas devueltas por la fuente
    refreshed: int   # conocidas → observación registrada
    unmatched: int   # desconocidas SIN matcher → descartadas (legacy F1)
    matched: int = 0  # desconocidas enrutadas a la cascada F2.0 (matcher activo)
    discarded: int = 0  # desconocidas DESCARTADAS por el relevance gate (R2, fuera de scope)
    # Desenlace de la cascada (F4 #4.3). `matched` sola ENGAÑA a un operador de Descubrimiento:
    # cuenta lo enrutado e incluye a los encolados, así que una corrida que no enlazó NADA y dejó
    # 40 productos de trabajo humano se ve igual que una que enlazó los 40. Estos dos contadores
    # salen del `ProductMatch.status` que la cascada YA devolvía y que este use-case descartaba.
    # Invariante: auto_linked + queued_for_review <= matched (el resto son `rejected`, raro pero
    # posible; ver el test dedicado).
    auto_linked: int = 0        # la cascada enlazó sola (ean/trgm/vector/hybrid/llm)
    queued_for_review: int = 0  # quedó pendiente de decisión humana en la cola


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

    def execute(
        self,
        source: CatalogSource,
        captured_at: datetime | None = None,
        run_id: str | None = None,
    ) -> RefreshResult:
        """`run_id` = la corrida del orquestador que ejecuta este refresh (F4 #4.5). Se estampa en
        cada `product_match` que produzca la cascada, y es lo que después permite filtrar la cola
        por corrida y atribuirle los canónicos que salgan de ella. `None` cuando se corre fuera del
        orquestador (p.ej. el CLI `make save-refresh`): no hay corrida a la que atribuir."""
        ts = captured_at or datetime.now(timezone.utc)
        seen = refreshed = unmatched = matched = discarded = 0
        auto_linked = queued_for_review = 0
        for entry in source.fetch():
            seen += 1
            if not self._store_repo.exists(entry.provider_id, entry.external_id):
                # R2: descarta EN DESCUBRIMIENTO el ruido fuera de scope (p.ej. Magento hace OR de
                # tokens y trae comida de perro por "arroz") ANTES de materializar/matchear. Solo
                # aplica a desconocidos; los conocidos ya ingeridos no se re-evalúan.
                if self._relevance is not None and self._relevance.is_off_scope(
                    ClassifiableProduct(
                        ref_id="",
                        is_canonical=False,
                        name=entry.name or "",
                        brand=entry.brand or "",
                        size_text=entry.size_text or "",
                        source_category=" > ".join(entry.category_path),
                    )
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
                outcome = self._matcher.execute(
                    IncomingStoreProduct(
                        store_product_id=store_product_id,
                        market_id=entry.market_id,
                        name=entry.name,
                        brand=entry.brand,
                        size=entry.size_text,
                        ean=entry.ean,
                        source_category=" > ".join(entry.category_path),  # Etapa C: señal de categoría
                        run_id=run_id,
                    )
                )
                self._classify(store_product_id, entry)  # clasifica el nuevo store_product
                matched += 1
                # El desenlace se lee del status, NO se infiere de `canonical_product_id`: un
                # `pending_review` puede traer un candidato sugerido sin que eso sea un enlace.
                if outcome.status == "auto_linked":
                    auto_linked += 1
                elif outcome.status == "pending_review":
                    queued_for_review += 1
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
            seen=seen,
            refreshed=refreshed,
            unmatched=unmatched,
            matched=matched,
            discarded=discarded,
            auto_linked=auto_linked,
            queued_for_review=queued_for_review,
        )
