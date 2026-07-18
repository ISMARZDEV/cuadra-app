"""TaxonomyRelevanceGate (R2) — descarta EN DESCUBRIMIENTO el ruido fuera del scope del catálogo.

Medido 2026-07-16/18: aun con la canasta acotada a arroz+legumbre, Magento hace OR de tokens y trae
comida de perro / velas / pañitos por queries de "arroz"/"verdes" → ~45% de la cola era ruido de
categorías que el catálogo no cubre.

**Resolución por CLASIFICACIÓN (no por el `source_category` crudo).** Un primer intento resolvía el
`source_category` de la tienda contra nuestra taxonomía por lexicon, y fallaba cuando el vocabulario
no coincidía: Bravo usa códigos opacos (`FV-005`), Jumbo/Sirena un top genérico ("Supermercado"). En
cambio, la cascada de clasificación (`ClassifyStoreProduct.decide`: léxico + trgm + vector sobre el
NOMBRE, cruzado con la categoría de origen) mapea el producto a NUESTRA taxonomía por SIMILITUD — así
funciona aunque la categoría de la tienda sea opaca o distinta. Referencia SupermercadosRD: usa un
denylist de categorías en el vocabulario propio de cada tienda + excepciones por keyword de nombre;
nosotros generalizamos eso clasificando el nombre, que además cubre a Bravo.

Se contrasta contra el FOOTPRINT del catálogo — las raíces top-level que ocupan los canónicos. Se
compara a nivel top-level (no por hoja): el catálogo es de un pasillo y un footprint por-hoja
sobre-descartaría; top-level corta Mascotas/Hogar/Bebidas y se ensancha solo al crecer el catálogo.

Contrato CONSERVADOR (misma filosofía que los gates de matching): descarta SOLO cuando la
clasificación es CONFIADA (banda `auto_link`) y su raíz cae fuera del footprint. Si el producto NO se
clasifica con confianza (None, o banda grey/human), NO descarta — perder descubrimiento legítimo es
el error caro; dejar ruido en la cola es el barato. Satisface `RelevanceGate` (Protocol en
`application/refresh_prices.py`) por duck-typing.
"""
from __future__ import annotations

from typing import Protocol

from ...domain.classification import ClassifiableProduct, ClassificationResult


class _CategoryClassifier(Protocol):
    """Lo mínimo que el gate necesita: la DECISIÓN de categoría, sin persistir (`ClassifyStoreProduct.decide`)."""

    def decide(self, product: ClassifiableProduct, market_id: str) -> ClassificationResult: ...


class TaxonomyRelevanceGate:
    def __init__(
        self,
        *,
        classifier: _CategoryClassifier,
        leaf_to_root: dict[str, str],
        footprint: frozenset[str],
        market_id: str,
    ) -> None:
        self._classifier = classifier
        self._leaf_to_root = leaf_to_root
        self._footprint = footprint
        self._market_id = market_id

    def is_off_scope(self, product: ClassifiableProduct) -> bool:
        result = self._classifier.decide(product, self._market_id)
        # Sin clasificación CONFIADA (None, o banda grey/human) → sin señal positiva → no descartar.
        if result.taxonomy_node_id is None or result.band != "auto_link":
            return False
        root_id = self._leaf_to_root.get(result.taxonomy_node_id, result.taxonomy_node_id)
        return root_id not in self._footprint
