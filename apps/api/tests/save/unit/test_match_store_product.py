"""Unit — MatchStoreProduct (F2.0 cascada de matching, application layer). PURA (fakes, sin DB
ni LLM real): EAN exacto -> trgm/vector fusionados por RRF -> boosts -> banding -> Claude-judge
(solo banda gris) -> cola humana. Ver design §Cascade Contract.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from src.contexts.save.application.match_store_product import (
    IncomingStoreProduct,
    MatchStoreProduct,
)
from src.contexts.save.domain.entities import CanonicalProduct, MatchCandidate
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure

MARKET = "DO"


# ---------------------------------------------------------------- fakes ----------


class FakeCascadeMatchRepository:
    """Fake de ProductMatchRepository + la etapa EAN (find_candidates_by_ean)."""

    def __init__(
        self,
        *,
        ean_candidates: list[MatchCandidate] | None = None,
        trgm_candidates: list[MatchCandidate] | None = None,
        vector_candidates: list[MatchCandidate] | None = None,
    ) -> None:
        self._ean = ean_candidates or []
        self._trgm = trgm_candidates or []
        self._vector = vector_candidates or []
        self.ean_calls: list[tuple[str, str]] = []
        self.trgm_calls: list[tuple[str, str]] = []
        self.vector_calls: list[tuple[list[float], str]] = []
        self.records: list[dict] = []
        self._by_store_product: dict[str, dict] = {}

    def find_candidates_by_ean(self, ean: str, market_id: str) -> list[MatchCandidate]:
        self.ean_calls.append((ean, market_id))
        return self._ean

    def find_candidates_trgm(
        self, name: str, market_id: str, limit: int = 20
    ) -> list[MatchCandidate]:
        self.trgm_calls.append((name, market_id))
        return self._trgm

    def find_candidates_vector(
        self, embedding: list[float], market_id: str, limit: int = 20
    ) -> list[MatchCandidate]:
        self.vector_calls.append((embedding, market_id))
        return self._vector

    def record_match(
        self,
        *,
        store_product_id: str,
        canonical_product_id: str | None,
        confidence: float,
        method: str,
        status: str,
    ) -> str:
        existing = self._by_store_product.get(store_product_id)
        if existing is not None:
            existing["canonical_product_id"] = canonical_product_id
            existing["confidence"] = confidence
            existing["method"] = method
            existing["status"] = status
            return existing["id"]
        record = {
            "id": f"match-{len(self.records) + 1}",
            "store_product_id": store_product_id,
            "canonical_product_id": canonical_product_id,
            "confidence": confidence,
            "method": method,
            "status": status,
        }
        self.records.append(record)
        self._by_store_product[store_product_id] = record
        return record["id"]

    def list_review_queue(self, market_id: str) -> list:  # not used by the use-case
        raise NotImplementedError

    def resolve_review(self, match_id: str, canonical_product_id, decided_by: str) -> None:
        raise NotImplementedError


class FakeStoreProductLinkRepository:
    """Fake del escritor del FK denormalizado (store_product.canonical_product_id)."""

    def __init__(self) -> None:
        self.links: list[tuple[str, str]] = []

    def link_to_canonical(self, store_product_id: str, canonical_product_id: str) -> None:
        self.links.append((store_product_id, canonical_product_id))


class FakeEmbeddingProvider:
    def __init__(self, vector: list[float] | None = None) -> None:
        self._vector = vector or [0.1, 0.2, 0.3]
        self.calls: list[list[str]] = []

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(texts)
        return [self._vector for _ in texts]


@dataclass(frozen=True)
class FakeVerdict:
    decision: str
    confidence: float
    cited_fields: list[str]


class FakeJudge:
    def __init__(self, verdict: FakeVerdict) -> None:
        self._verdict = verdict
        self.calls: list[tuple[dict, dict]] = []

    def judge(self, *, store_product: dict, canonical_product: dict) -> FakeVerdict:
        self.calls.append((store_product, canonical_product))
        return self._verdict


class FakeCanonicalProductRepository:
    def __init__(self, products: dict[str, CanonicalProduct]) -> None:
        self._products = products

    def get_by_id(self, product_id: str) -> CanonicalProduct | None:
        return self._products.get(product_id)


# ---------------------------------------------------------------- helpers ----------


def _canonical(
    cid: str, name: str = "Arroz La Garza 5lb", brand: str = "La Garza", size: str = "5 LB"
) -> CanonicalProduct:
    return CanonicalProduct(
        id=cid,
        name=name,
        brand=brand,
        quantity=Quantity(Decimal("2.267"), UnitMeasure.MASS),
        taxonomy_node_id="node-1",
        market_id=MARKET,
        display_size=size,
    )


def _incoming(
    *,
    store_product_id: str = "sp-1",
    name: str = "Arroz La Garza 5lb",
    brand: str = "La Garza",
    size: str = "5 LB",
    ean: str | None = None,
) -> IncomingStoreProduct:
    return IncomingStoreProduct(
        store_product_id=store_product_id,
        market_id=MARKET,
        name=name,
        brand=brand,
        size=size,
        ean=ean,
    )


def _make_use_case(
    *,
    match_repo: FakeCascadeMatchRepository | None = None,
    store_repo: FakeStoreProductLinkRepository | None = None,
    canonical_repo: FakeCanonicalProductRepository | None = None,
    embedder: FakeEmbeddingProvider | None = None,
    judge: FakeJudge | None = None,
) -> tuple[MatchStoreProduct, dict]:
    match_repo = match_repo or FakeCascadeMatchRepository()
    store_repo = store_repo or FakeStoreProductLinkRepository()
    canonical_repo = canonical_repo or FakeCanonicalProductRepository({})
    embedder = embedder or FakeEmbeddingProvider()
    judge = judge or FakeJudge(FakeVerdict("uncertain", 0.0, []))
    use_case = MatchStoreProduct(
        match_repo=match_repo,
        store_repo=store_repo,
        canonical_repo=canonical_repo,
        embedding_provider=embedder,
        judge=judge,
    )
    collaborators = {
        "match_repo": match_repo,
        "store_repo": store_repo,
        "canonical_repo": canonical_repo,
        "embedder": embedder,
        "judge": judge,
    }
    return use_case, collaborators


# ---------------------------------------------------------------- EAN stage ----------


def test_ean_unique_auto_links_and_skips_later_stages() -> None:
    match_repo = FakeCascadeMatchRepository(
        ean_candidates=[MatchCandidate(canonical_product_id="canon-ean-1", score=1.0)]
    )
    use_case, c = _make_use_case(match_repo=match_repo)

    result = use_case.execute(_incoming(ean="7501234567890"))

    assert result.status == "auto_linked"
    assert result.method == "ean"
    assert result.confidence == 1.0
    assert result.canonical_product_id == "canon-ean-1"
    assert match_repo.records == [
        {
            "id": "match-1",
            "store_product_id": "sp-1",
            "canonical_product_id": "canon-ean-1",
            "confidence": 1.0,
            "method": "ean",
            "status": "auto_linked",
        }
    ]
    assert c["store_repo"].links == [("sp-1", "canon-ean-1")]
    # later stages SKIPPED entirely
    assert match_repo.trgm_calls == []
    assert match_repo.vector_calls == []
    assert c["embedder"].calls == []
    assert c["judge"].calls == []


def test_ean_null_falls_through_to_lexical_semantic() -> None:
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.90)],
    )
    canonical_repo = FakeCanonicalProductRepository({"canon-1": _canonical("canon-1")})
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    result = use_case.execute(_incoming(ean=None))

    assert match_repo.ean_calls == []  # never attempted — nothing to look up
    assert len(match_repo.trgm_calls) == 1
    assert len(match_repo.vector_calls) == 1
    assert result.status == "auto_linked"  # proves the fallthrough actually completed


def test_ean_no_match_falls_through_to_lexical_semantic() -> None:
    match_repo = FakeCascadeMatchRepository(
        ean_candidates=[],
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.90)],
    )
    canonical_repo = FakeCanonicalProductRepository({"canon-1": _canonical("canon-1")})
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    result = use_case.execute(_incoming(ean="000"))

    assert len(match_repo.ean_calls) == 1  # attempted
    assert len(match_repo.trgm_calls) == 1
    assert len(match_repo.vector_calls) == 1
    assert result.status == "auto_linked"


def test_ean_collision_routes_to_review_and_skips_later_stages() -> None:
    match_repo = FakeCascadeMatchRepository(
        ean_candidates=[
            MatchCandidate(canonical_product_id="canon-a", score=1.0),
            MatchCandidate(canonical_product_id="canon-b", score=1.0),
        ]
    )
    use_case, c = _make_use_case(match_repo=match_repo)

    result = use_case.execute(_incoming(ean="dup-ean"))

    assert result.status == "pending_review"
    assert result.canonical_product_id is None
    assert result.method == "human"
    assert c["store_repo"].links == []  # NOT auto-linked
    assert match_repo.trgm_calls == []
    assert match_repo.vector_calls == []
    assert c["embedder"].calls == []
    assert c["judge"].calls == []


# ---------------------------------------------------------------- fusion + banding ----------


def test_fusion_picks_consensus_candidate_and_auto_links_hybrid() -> None:
    # canon-x ranks #1 in trgm alone (higher raw score) but canon-y is present in BOTH lists —
    # RRF's rank-consensus must beat a single-stage high score.
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[
            MatchCandidate(canonical_product_id="canon-x", score=0.95),
            MatchCandidate(canonical_product_id="canon-y", score=0.50),
        ],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-y", score=0.93)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-y": _canonical("canon-y", brand="Otra Marca", size="1 KG")}
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    result = use_case.execute(_incoming())

    assert result.canonical_product_id == "canon-y"  # consensus winner, not canon-x
    assert result.status == "auto_linked"
    assert result.method == "hybrid"  # contributed by both stages
    assert result.confidence == 0.93  # best raw per-stage score for the winner, no boosts
    assert c["store_repo"].links == [("sp-1", "canon-y")]
    assert c["judge"].calls == []


def test_high_band_boosts_from_exact_brand_and_size_match() -> None:
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.75)],
        vector_candidates=[],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="La Garza", size="5 LB")}
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    result = use_case.execute(_incoming(brand="La Garza", size="5 LB"))

    # 0.75 + 0.10 (brand) + 0.05 (size) = 0.90 >= HIGH(0.85)
    assert result.confidence == 0.90
    assert result.status == "auto_linked"
    assert result.method == "trgm"  # single stage contributed


def test_grey_band_invokes_judge_and_auto_links_on_match_verdict() -> None:
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="Otra", size="Otro")}
    )
    judge = FakeJudge(FakeVerdict("match", 0.97, ["brand agrees"]))
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo, judge=judge)

    result = use_case.execute(_incoming())

    assert len(judge.calls) == 1
    store_arg, canonical_arg = judge.calls[0]
    assert store_arg["name"] == "Arroz La Garza 5lb"
    assert canonical_arg["name"] == "Arroz La Garza 5lb"
    assert result.status == "auto_linked"
    assert result.method == "llm"
    assert result.confidence == 0.97
    assert c["store_repo"].links == [("sp-1", "canon-1")]


def test_grey_band_no_match_verdict_routes_to_pending_review() -> None:
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="Otra", size="Otro")}
    )
    judge = FakeJudge(FakeVerdict("no_match", 0.10, ["brand disagrees"]))
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo, judge=judge)

    result = use_case.execute(_incoming())

    assert len(judge.calls) == 1
    assert result.status == "pending_review"
    assert result.canonical_product_id is None
    assert result.method == "llm"
    assert result.confidence == 0.10
    assert c["store_repo"].links == []


def test_grey_band_uncertain_verdict_routes_to_pending_review() -> None:
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="Otra", size="Otro")}
    )
    judge = FakeJudge(FakeVerdict("uncertain", 0.0, []))
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo, judge=judge)

    result = use_case.execute(_incoming())

    assert result.status == "pending_review"
    assert result.method == "llm"
    assert c["store_repo"].links == []


def test_below_mid_score_routes_to_human_without_invoking_judge() -> None:
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.30)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="Otra", size="Otro")}
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    result = use_case.execute(_incoming())

    assert result.status == "pending_review"
    assert result.method == "human"
    assert result.confidence == 0.30
    assert c["judge"].calls == []
    assert c["store_repo"].links == []


def test_no_candidates_routes_to_human_without_invoking_judge() -> None:
    match_repo = FakeCascadeMatchRepository(trgm_candidates=[], vector_candidates=[])
    use_case, c = _make_use_case(match_repo=match_repo)

    result = use_case.execute(_incoming())

    assert result.status == "pending_review"
    assert result.method == "human"
    assert result.confidence == 0.0
    assert c["judge"].calls == []
    assert c["store_repo"].links == []


# ---------------------------------------------------------------- invariants ----------


def test_same_transaction_invariant_writes_link_and_match_together() -> None:
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="Otra", size="Otro")}
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    result = use_case.execute(_incoming())

    assert result.status == "auto_linked"
    assert len(c["store_repo"].links) == 1
    assert len(match_repo.records) == 1
    link_sp, link_cid = c["store_repo"].links[0]
    record = match_repo.records[0]
    assert link_sp == record["store_product_id"] == "sp-1"
    assert link_cid == record["canonical_product_id"] == "canon-1"


def test_idempotent_rerun_does_not_duplicate_pending_entry() -> None:
    match_repo = FakeCascadeMatchRepository(trgm_candidates=[], vector_candidates=[])
    use_case, c = _make_use_case(match_repo=match_repo)
    product = _incoming()

    use_case.execute(product)
    use_case.execute(product)

    assert len(match_repo.records) == 1
    assert match_repo.records[0]["status"] == "pending_review"
