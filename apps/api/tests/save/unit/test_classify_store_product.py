"""Unit — ClassifyStoreProduct (save-category-classification, Batch 7). Fakes, sin DB.

Cascada: léxico → (trgm+vector) → RRF (consenso) → banding(score crudo del ganador) → juez(grey).
- léxico-hit → persist(lexicon), sin tocar embedder ni juez.
- auto → persist(hybrid/trgm/vector).
- grey + match ≥ piso → persist(llm); grey + uncertain → NO persist (sin clasificar).
- human / sin candidatos → NO persist.
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


def test_auto_band_persists_hybrid() -> None:
    cls = _FakeClassifications()
    cand = _FakeCandidates(trgm=[_cand("n1", 0.9, "trgm")], vector=[_cand("n1", 0.88, "vector")])
    uc = _make(cls, cand, _FakeEmbedder(), _FakeJudge())

    result = uc.execute(_PRODUCT, "DO")

    assert result.taxonomy_node_id == "n1"
    assert result.method == "hybrid"  # en ambas listas
    assert cls.saved[0].method == "hybrid"


def test_grey_band_match_above_floor_persists_llm() -> None:
    cls = _FakeClassifications()
    cand = _FakeCandidates(trgm=[_cand("n1", 0.6, "trgm", name="Arroz, Granos & Legumbres")])
    judge = _FakeJudge(CategoryVerdict(decision="match", confidence=0.85, cited_fields=[]))
    uc = _make(cls, cand, _FakeEmbedder(), judge)

    result = uc.execute(_PRODUCT, "DO")

    assert judge.called is True
    assert result.method == "llm" and result.taxonomy_node_id == "n1"
    assert cls.saved[0].method == "llm"


def test_grey_band_uncertain_does_not_persist() -> None:
    cls = _FakeClassifications()
    cand = _FakeCandidates(trgm=[_cand("n1", 0.6, "trgm")])
    judge = _FakeJudge(CategoryVerdict(decision="uncertain", confidence=0.0, cited_fields=[]))
    uc = _make(cls, cand, _FakeEmbedder(), judge)

    result = uc.execute(_PRODUCT, "DO")

    assert result.taxonomy_node_id is None
    assert cls.saved == []


def test_grey_band_match_below_floor_does_not_persist() -> None:
    cls = _FakeClassifications()
    cand = _FakeCandidates(trgm=[_cand("n1", 0.6, "trgm")])
    judge = _FakeJudge(CategoryVerdict(decision="match", confidence=0.5, cited_fields=[]))  # < 0.70
    uc = _make(cls, cand, _FakeEmbedder(), judge)

    assert uc.execute(_PRODUCT, "DO").taxonomy_node_id is None
    assert cls.saved == []


def test_human_band_does_not_persist() -> None:
    cls = _FakeClassifications()
    cand = _FakeCandidates(trgm=[_cand("n1", 0.3, "trgm")])  # < 0.55 → human
    uc = _make(cls, cand, _FakeEmbedder(), _FakeJudge())

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
