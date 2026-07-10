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
