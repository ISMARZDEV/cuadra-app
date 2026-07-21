"""Use case `ClassifyStoreProduct` — cascada de clasificación de categoría (save-category-classification).

Espeja `MatchStoreProduct` SIN la etapa EAN, con una etapa léxica determinista al frente:

  léxico → (trgm + vector) → RRF (consenso del ganador) → banding(score CRUDO del ganador)
         → juez LLM (solo banda grey, con piso de confianza)

Persiste una fila `category_classification` `active` (la HOJA) SOLO cuando hay decisión confiable;
ante duda deja el producto SIN clasificar (NUNCA inventa categoría). RRF elige el ganador por
consenso, pero la BANDA se decide con el mejor score crudo del ganador (trgm/vector viven en [0,1]),
no con el score RRF (que es minúsculo) — mismo criterio que el matching.
"""
from __future__ import annotations

import uuid

from ..domain.classification import (
    CategoryClassification,
    ClassifiableProduct,
    ClassificationResult,
)
from ..domain.ports.repositories import (
    CategoryCandidateRepository,
    CategoryClassificationRepository,
    CategoryJudgePort,
    EmbeddingProvider,
)
from ..infrastructure.classification.lexicon import (
    LexiconIndex,
    lexicon_match,
    lexicon_match_path,
)
from ..infrastructure.classification.category_banding import decide_by_vector_margin
from ..infrastructure.matching.cascade.banding import JUDGE_MATCH_MIN_CONFIDENCE

_UNCLASSIFIED = ClassificationResult(taxonomy_node_id=None, confidence=0.0, method="none", band="human")

# Etapa B — confianzas de la política de cruce (señal de origen × señal de nombre).
_SOURCE_NAME_AGREE_CONFIDENCE = 0.97  # ambas señales fuertes coinciden → la decisión más confiable
_SOURCE_ONLY_CONFIDENCE = 0.90        # solo la fuente resuelve → autoridad sobre su propio producto
# Conflicto de dos señales fuertes: NO se auto-clasifica (mismo criterio que la colisión de EAN en
# el matching). Se deja sin clasificar para que el humano decida viendo ambas.
_CONFLICT = ClassificationResult(taxonomy_node_id=None, confidence=0.0, method="conflict", band="human")


class ClassifyStoreProduct:
    def __init__(
        self,
        classifications: CategoryClassificationRepository,
        candidates: CategoryCandidateRepository,
        # `None` = este proceso NO tiene el modelo de embeddings. No es un caso hipotético: la API
        # web no puede cargar BGE-M3 porque `sentence-transformers` vive en el grupo de dependencias
        # `ingestion` (misma regla que impide importar `dagster` en el adapter del orquestador —
        # importarlo reventaría la API al arrancar en producción, con un fallo invisible en local).
        # Simétrico a `judge=None`: sin la etapa, no se inventa categoría.
        embedder: EmbeddingProvider | None,
        judge: CategoryJudgePort | None,
        lexicon_index: LexiconIndex,
    ) -> None:
        self._classifications = classifications
        self._candidates = candidates
        self._embedder = embedder
        self._judge = judge
        self._lexicon = lexicon_index

    def execute(self, product: ClassifiableProduct, market_id: str) -> ClassificationResult:
        # Idempotente: si el producto YA tiene clasificación `active`, no re-corre la cascada (así
        # el enganche inline no reclasifica en cada refresh de precio, R11). Devuelve la existente.
        existing = self._classifications.active_for(
            product.ref_id, is_canonical=product.is_canonical
        )
        if existing is not None:
            return ClassificationResult(
                existing.taxonomy_node_id, existing.confidence, existing.method, "auto_link"
            )

        result = self._decide(product, market_id)
        # Persistencia ÚNICA (fuera de la decisión): solo si hay hoja confiable — ante duda/conflicto
        # NUNCA inventa categoría (regla sagrada, espeja el matching).
        if result.taxonomy_node_id is not None:
            self._persist(product, result.taxonomy_node_id, result.confidence, result.method)
        return result

    def decide(self, product: ClassifiableProduct, market_id: str) -> ClassificationResult:
        """Decisión de categoría PURA — sin idempotencia ni persistencia. Para consumidores que
        solo necesitan la categoría sin registrar la clasificación: el relevance gate R2 decide
        descartar ANTES de materializar el store_product, cuando todavía no hay `ref_id`."""
        return self._decide(product, market_id)

    def _decide(self, product: ClassifiableProduct, market_id: str) -> ClassificationResult:
        """Etapa B — cruza DOS señales independientes: la categoría de ORIGEN (fuente) y el NOMBRE.

        Política (mismo espíritu que el matching: señales fuertes; en conflicto → humano):
        - ambas resuelven y COINCIDEN → auto reforzado (`source_name`).
        - ambas resuelven y DIFIEREN  → conflicto → sin clasificar (lo decide el humano).
        - solo la fuente resuelve      → la fuente es autoridad (`source`).
        - solo el nombre resuelve      → comportamiento por-nombre (lexicon/trgm/vector/llm).
        """
        source_hit = self._match_source_path(product.source_category)
        by_name = self._classify_by_name(product, market_id)

        if source_hit is None:
            return by_name  # sin señal de origen → solo nombre

        source_leaf, _ = source_hit
        if by_name.taxonomy_node_id is None:
            return ClassificationResult(source_leaf, _SOURCE_ONLY_CONFIDENCE, "source", "auto_link")
        if by_name.taxonomy_node_id == source_leaf:
            return ClassificationResult(
                source_leaf, _SOURCE_NAME_AGREE_CONFIDENCE, "source_name", "auto_link"
            )
        return _CONFLICT  # dos señales fuertes en conflicto → humano

    def _match_source_path(self, source_category: str) -> tuple[str, float] | None:
        """Categoría de origen (path jerárquico) → hoja, segmento a segmento (hondo→general).
        Delega en `lexicon_match_path` (compartido con el matcher, Etapa C)."""
        return lexicon_match_path(source_category, self._lexicon)

    def _classify_by_name(
        self, product: ClassifiableProduct, market_id: str
    ) -> ClassificationResult:
        """Cascada por NOMBRE (léxico → vector-con-margen → juez opcional). PURA: nunca persiste —
        devuelve la decisión para que `_decide` la cruce con la señal de origen y `execute` persista.

        Sin trgm/RRF (a diferencia del matching): medido (120 hojas × 30 productos), el trgm de
        categorías compara el nombre del producto contra el nombre de la HOJA — que no lleva los
        `classification_terms` — así que es ruido y contamina el consenso RRF (17% de precisión). El
        match literal de tokens que el trgm aportaría ya lo cubre el LÉXICO (Etapa 1). La señal que
        SÍ discrimina es el vector con la receta descriptiva; el banding es por MARGEN, no por score
        absoluto (`category_banding`). Ver esa doc para la evidencia."""
        # --- Etapa 1: léxico determinista ---
        hit = lexicon_match(product.name, self._lexicon)
        if hit is not None:
            leaf_id, confidence = hit
            return ClassificationResult(leaf_id, confidence, "lexicon", "auto_link")

        # --- Etapa 2: vector semántico, decisión por MARGEN ---
        # Sin modelo en este proceso NO se sigue: se deja sin clasificar, igual que la banda grey
        # con el juez apagado. Inventar acá sería peor que no responder, y reventar por
        # `None.embed(...)` convertiría "no tengo esa etapa" en "la consola está rota".
        # Medido sobre la cola real (48 filas): léxico + señal de origen resolvieron el 100%, así
        # que en la práctica esta rama es la excepción, no el camino normal.
        if self._embedder is None:
            return ClassificationResult(None, 0.0, "none", "grey")
        embedding = self._embedder.embed([product.name])[0]
        vector = self._candidates.find_leaves_vector(embedding, market_id, limit=5)
        winner_id, score, band = decide_by_vector_margin(vector)

        if band == "auto_link":
            return ClassificationResult(winner_id, score, "vector", "auto_link")

        if band == "grey":
            # Margen fino: el vector no destaca claro. Con el juez apagado
            # (`SAVE_LLM_JUDGE_ENABLED=false`, decisión de producto) NO se clasifica — no inventar
            # categoría (regla sagrada). Con el juez, arbitra sobre el candidato top del vector.
            if self._judge is None:
                return ClassificationResult(None, 0.0, "none", "grey")
            top = vector[0]
            verdict = self._judge.judge(product, top.name)
            if verdict.decision == "match" and verdict.confidence >= JUDGE_MATCH_MIN_CONFIDENCE:
                return ClassificationResult(top.taxonomy_node_id, verdict.confidence, "llm", "grey")
            return ClassificationResult(None, 0.0, "none", "grey")

        # banda human (sin candidatos) → sin clasificar
        return _UNCLASSIFIED

    def _persist(
        self, product: ClassifiableProduct, leaf_id: str, confidence: float, method: str
    ) -> None:
        self._classifications.save_active(
            CategoryClassification(
                id=str(uuid.uuid4()),
                store_product_id=None if product.is_canonical else product.ref_id,
                canonical_product_id=product.ref_id if product.is_canonical else None,
                taxonomy_node_id=leaf_id,
                confidence=confidence,
                method=method,
                status="active",
            )
        )
