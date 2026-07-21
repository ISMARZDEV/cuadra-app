"""Unit — ClassifyStoreProduct (save-category-classification, Batch 7). Fakes, sin DB.

Cascada por nombre: léxico → vector-con-MARGEN → juez(grey). Sin trgm/RRF (el trgm de categorías
contamina; medido — ver `category_banding`).
- léxico-hit → persist(lexicon), sin tocar embedder ni juez.
- vector con margen claro → persist(vector).
- margen fino (grey) + match ≥ piso → persist(llm); grey + uncertain/sin juez → NO persist.
- sin candidatos (human) → NO persist.
"""
from __future__ import annotations

from src.contexts.save.domain.classification import (
    CategoryCandidate,
    CategoryVerdict,
    ClassifiableProduct,
)
from src.contexts.save.application.classify_store_product import ClassifyStoreProduct

_PRODUCT = ClassifiableProduct(
    ref_id="sp-1", is_canonical=False, name="Arroz Blanco Sirena", brand="Sirena", size_text="5 Lb"
)


class _FakeClassifications:
    def __init__(self) -> None:
        self.saved: list = []

    def save_active(self, c) -> None:  # type: ignore[no-untyped-def]
        self.saved.append(c)

    def active_for(self, ref_id, *, is_canonical):  # type: ignore[no-untyped-def]
        return None


class _FakeCandidates:
    def __init__(self, trgm=None, vector=None) -> None:  # type: ignore[no-untyped-def]
        self._trgm = trgm or []
        self._vector = vector or []
        self.embed_called = False

    def find_leaves_trgm(self, name, market_id, limit):  # type: ignore[no-untyped-def]
        return self._trgm

    def find_leaves_vector(self, embedding, market_id, limit):  # type: ignore[no-untyped-def]
        return self._vector


class _FakeEmbedder:
    def __init__(self) -> None:
        self.called = False

    def embed(self, texts):  # type: ignore[no-untyped-def]
        self.called = True
        return [[0.1] * 4 for _ in texts]


class _FakeJudge:
    def __init__(self, verdict: CategoryVerdict | None = None) -> None:
        self.verdict = verdict
        self.called = False

    def judge(self, product, candidate_name):  # type: ignore[no-untyped-def]
        self.called = True
        return self.verdict


def _cand(node_id, score, source, name="Cat"):  # type: ignore[no-untyped-def]
    return CategoryCandidate(taxonomy_node_id=node_id, score=score, source=source, name=name)


def _make(classifications, candidates, embedder, judge, lexicon=None):  # type: ignore[no-untyped-def]
    return ClassifyStoreProduct(classifications, candidates, embedder, judge, lexicon or {})


def test_lexicon_hit_persists_without_embedder_or_judge() -> None:
    cls, cand, emb, jdg = _FakeClassifications(), _FakeCandidates(), _FakeEmbedder(), _FakeJudge()
    uc = _make(cls, cand, emb, jdg, lexicon={"arroz": "n-arroz"})

    result = uc.execute(_PRODUCT, "DO")

    assert result.taxonomy_node_id == "n-arroz"
    assert result.method == "lexicon"
    assert len(cls.saved) == 1 and cls.saved[0].taxonomy_node_id == "n-arroz"
    assert emb.called is False and jdg.called is False


def test_decide_returns_the_decision_without_persisting() -> None:
    # `decide` = decisión pura (para el relevance gate R2, que decide ANTES de materializar).
    cls = _FakeClassifications()
    uc = _make(cls, _FakeCandidates(), _FakeEmbedder(), _FakeJudge(), lexicon={"arroz": "n-arroz"})

    result = uc.decide(_PRODUCT, "DO")

    assert result.taxonomy_node_id == "n-arroz"
    assert result.band == "auto_link"
    assert cls.saved == []  # a diferencia de execute(), decide() NO persiste


def test_clear_vector_margin_persists_vector() -> None:
    cls = _FakeClassifications()
    # margen 0.55−0.40 = 0.15 ≥ umbral → auto-link por vector (el trgm ya no participa)
    cand = _FakeCandidates(vector=[_cand("n1", 0.55, "vector"), _cand("n2", 0.40, "vector")])
    uc = _make(cls, cand, _FakeEmbedder(), _FakeJudge())

    result = uc.execute(_PRODUCT, "DO")

    assert result.taxonomy_node_id == "n1"
    assert result.method == "vector"
    assert cls.saved[0].method == "vector"


def _thin() -> "_FakeCandidates":  # margen 0.50−0.49 = 0.01 < umbral → banda grey
    return _FakeCandidates(
        vector=[
            _cand("n1", 0.50, "vector", name="Arroz, Granos & Legumbres"),
            _cand("n2", 0.49, "vector"),
        ]
    )


def test_thin_margin_match_above_floor_persists_llm() -> None:
    cls = _FakeClassifications()
    judge = _FakeJudge(CategoryVerdict(decision="match", confidence=0.85, cited_fields=[]))
    uc = _make(cls, _thin(), _FakeEmbedder(), judge)

    result = uc.execute(_PRODUCT, "DO")

    assert judge.called is True
    assert result.method == "llm" and result.taxonomy_node_id == "n1"
    assert cls.saved[0].method == "llm"


def test_thin_margin_uncertain_does_not_persist() -> None:
    cls = _FakeClassifications()
    judge = _FakeJudge(CategoryVerdict(decision="uncertain", confidence=0.0, cited_fields=[]))
    uc = _make(cls, _thin(), _FakeEmbedder(), judge)

    assert uc.execute(_PRODUCT, "DO").taxonomy_node_id is None
    assert cls.saved == []


def test_thin_margin_match_below_floor_does_not_persist() -> None:
    cls = _FakeClassifications()
    judge = _FakeJudge(CategoryVerdict(decision="match", confidence=0.5, cited_fields=[]))  # < 0.70
    uc = _make(cls, _thin(), _FakeEmbedder(), judge)

    assert uc.execute(_PRODUCT, "DO").taxonomy_node_id is None
    assert cls.saved == []


def test_thin_margin_without_judge_does_not_persist() -> None:
    # Juez apagado (decisión de producto): margen fino → sin clasificar (no inventa).
    cls = _FakeClassifications()
    uc = _make(cls, _thin(), _FakeEmbedder(), None)

    assert uc.execute(_PRODUCT, "DO").taxonomy_node_id is None
    assert cls.saved == []


def test_no_candidates_does_not_persist() -> None:
    cls = _FakeClassifications()
    uc = _make(cls, _FakeCandidates(), _FakeEmbedder(), _FakeJudge())

    assert uc.execute(_PRODUCT, "DO").taxonomy_node_id is None
    assert cls.saved == []


def _product(source_category: str = "", name: str = "Arroz Blanco Sirena") -> ClassifiableProduct:
    return ClassifiableProduct(
        ref_id="sp-1", is_canonical=False, name=name, brand="Sirena",
        size_text="5 Lb", source_category=source_category,
    )


# --- Etapa B: categoría de ORIGEN (category_path) como segunda señal, cruzada con el nombre -------


def test_source_and_name_agree_boosts_confidence() -> None:
    # source "Despensa Arroz" y name "Arroz Blanco" pegan la MISMA hoja por lexicon → auto reforzado.
    cls = _FakeClassifications()
    uc = _make(cls, _FakeCandidates(), _FakeEmbedder(), _FakeJudge(), lexicon={"arroz": "n-arroz"})

    result = uc.execute(_product(source_category="Despensa Arroz"), "DO")

    assert result.taxonomy_node_id == "n-arroz"
    assert result.method == "source_name"
    assert result.confidence >= 0.95
    assert cls.saved and cls.saved[0].taxonomy_node_id == "n-arroz"


def test_source_and_name_conflict_leaves_unclassified() -> None:
    # source dice "n-lacteos" y el nombre dice "n-arroz" → señales fuertes en CONFLICTO → NO auto.
    cls = _FakeClassifications()
    uc = _make(
        cls, _FakeCandidates(), _FakeEmbedder(), _FakeJudge(),
        lexicon={"arroz": "n-arroz", "leche": "n-lacteos"},
    )

    result = uc.execute(_product(source_category="Lacteos Leche", name="Arroz Blanco"), "DO")

    assert result.taxonomy_node_id is None
    assert result.method == "conflict"
    assert cls.saved == []  # ante conflicto no inventa: lo resuelve el humano


def test_source_only_when_name_unresolved() -> None:
    # el nombre no resuelve (sin lexicon ni candidatos) pero la fuente sí → la fuente es autoridad.
    cls = _FakeClassifications()
    uc = _make(cls, _FakeCandidates(), _FakeEmbedder(), _FakeJudge(), lexicon={"arroz": "n-arroz"})

    result = uc.execute(_product(source_category="Granos Arroz", name="Zzz Qqq"), "DO")

    assert result.taxonomy_node_id == "n-arroz"
    assert result.method == "source"
    assert cls.saved and cls.saved[0].method == "source"


def test_source_path_matches_segment_by_segment_deepest_first() -> None:
    # El path de origen es jerárquico ("A > B > C"). Matchear el string entero mezcla tokens de
    # varios niveles y crea ambigüedad FALSA (varias hojas → None). Debe matchear segmento a
    # segmento, del más específico (hondo) al general, y tomar el primer hit inequívoco.
    cls = _FakeClassifications()
    lexicon = {
        "conservas": "n-enlatados", "enlatados": "n-enlatados",
        "vegetales": "n-vegetales", "legumbres": "n-legumbres",
    }
    uc = _make(cls, _FakeCandidates(), _FakeEmbedder(), _FakeJudge(), lexicon=lexicon)

    # 4º segmento (más hondo) es ambiguo (vegetales + legumbres); el 3º resuelve limpio.
    source = "Supermercado > Despensa > Conservas, Enlatados y aceitunas > Conserva vegetales y legumbres"
    result = uc.execute(_product(source_category=source, name="Guandules Verdes Wala"), "DO")

    assert result.taxonomy_node_id == "n-enlatados"
    assert result.method == "source"  # el nombre no resuelve → autoridad de la fuente


def test_no_source_category_falls_back_to_name() -> None:
    # sin categoría de origen → comportamiento actual (solo por nombre).
    cls = _FakeClassifications()
    uc = _make(cls, _FakeCandidates(), _FakeEmbedder(), _FakeJudge(), lexicon={"arroz": "n-arroz"})

    result = uc.execute(_product(source_category=""), "DO")

    assert result.taxonomy_node_id == "n-arroz"
    assert result.method == "lexicon"


def test_already_classified_is_idempotent() -> None:
    # producto con clasificación active previa → NO re-corre la cascada (R11), devuelve la existente
    from src.contexts.save.domain.classification import CategoryClassification

    class _WithActive:
        def save_active(self, c):  # type: ignore[no-untyped-def]
            raise AssertionError("no debe persistir de nuevo")

        def active_for(self, ref_id, *, is_canonical):  # type: ignore[no-untyped-def]
            return CategoryClassification(
                id="c1", store_product_id=ref_id, canonical_product_id=None,
                taxonomy_node_id="leaf-existente", confidence=0.9, method="lexicon", status="active",
            )

    emb, jdg = _FakeEmbedder(), _FakeJudge()
    result = _make(_WithActive(), _FakeCandidates(), emb, jdg).execute(_PRODUCT, "DO")

    assert result.taxonomy_node_id == "leaf-existente"
    assert emb.called is False and jdg.called is False


# ── LLM apagado (`SAVE_LLM_JUDGE_ENABLED=false`) ──────────────────────────────────────────────
# Mismo switch preventivo que en el matcher. Acá es más simple: sin veredicto NO se clasifica, y
# ese camino ya usa method="none" (no "llm"), así que no hay riesgo de mentir en el método.
# Lo determinista NO se toca: el léxico y la banda alta siguen clasificando gratis.


def test_grey_band_without_a_judge_does_not_classify_and_never_calls_the_api() -> None:
    cls = _FakeClassifications()
    cand = _FakeCandidates(trgm=[_cand("n1", 0.6, "trgm", name="Arroz, Granos & Legumbres")])
    uc = _make(cls, cand, _FakeEmbedder(), None)

    result = uc.execute(_PRODUCT, "DO")

    assert result.taxonomy_node_id is None, "sin juez no se inventa una categoría"
    assert result.method == "none"
    assert cls.saved == [], "no persiste nada"


def test_lexicon_still_classifies_with_the_judge_off() -> None:
    # Apagar el LLM no apaga la clasificación: el léxico es determinista y sigue igual.
    cls, cand, emb = _FakeClassifications(), _FakeCandidates(), _FakeEmbedder()
    uc = _make(cls, cand, emb, None, lexicon={"arroz": "n-arroz"})

    result = uc.execute(_PRODUCT, "DO")

    assert result.taxonomy_node_id == "n-arroz" and result.method == "lexicon"
    assert emb.called is False, "el léxico ni siquiera embebe"


class TestWithoutTheVectorStage:
    """`embedder=None` — el proceso NO tiene el modelo (caso REAL: la API).

    `sentence-transformers` (BGE-M3) vive en el grupo de dependencias `ingestion`, NO en las de la
    API: importarlo desde el proceso web lo reventaría al arrancar en producción, con un fallo que
    en local no se ve (ahí el grupo sí está instalado). Es la misma regla que impide importar
    `dagster` en el adapter del orquestador.

    La salida es SIMÉTRICA a `judge=None`, que ya existía: sin la etapa, no se inventa categoría —
    el producto queda para el humano. Medido sobre la cola real (48 filas), las etapas deterministas
    (léxico por nombre + señal de origen) resolvieron el 100%, así que esta rama es la excepción,
    no el camino normal.
    """

    def test_lexicon_still_resolves_without_an_embedder(self) -> None:
        classifications = _FakeClassifications()
        use_case = ClassifyStoreProduct(
            classifications,
            _FakeCandidates(),
            None,  # sin modelo
            None,
            {"arroz": "leaf-arroz"},
        )

        result = use_case.execute(_PRODUCT, "DO")

        assert result.taxonomy_node_id == "leaf-arroz"
        assert result.method == "lexicon"
        assert len(classifications.saved) == 1

    def test_a_name_the_lexicon_cannot_resolve_is_left_to_the_human_not_a_crash(self) -> None:
        """Sin esta guarda la cascada llamaría `self._embedder.embed(...)` sobre `None` y tumbaría
        el endpoint. Devolver "sin clasificar" es la respuesta honesta: no sabemos, y no inventamos."""
        classifications = _FakeClassifications()
        use_case = ClassifyStoreProduct(
            classifications,
            _FakeCandidates(vector=[CategoryCandidate("leaf-x", 0.9, "vector", "Arroz")]),
            None,
            None,
            {},  # el léxico no resuelve nada
        )

        result = use_case.execute(
            ClassifiableProduct(ref_id="sp-9", is_canonical=False, name="Xyz Marca Rara"), "DO"
        )

        assert result.taxonomy_node_id is None
        assert result.band == "grey"
        assert classifications.saved == []  # NUNCA persiste una categoría inventada
