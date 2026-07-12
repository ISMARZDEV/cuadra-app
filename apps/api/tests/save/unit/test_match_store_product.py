"""Unit — MatchStoreProduct (F2.0 cascada de matching, application layer). PURA (fakes, sin DB
ni LLM real): EAN exacto -> trgm/vector fusionados por RRF -> boosts -> banding -> LLM judge
(solo banda gris) -> cola humana. Ver design §Cascade Contract.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from src.contexts.save.application.match_store_product import (
    IncomingStoreProduct,
    MatchStoreProduct,
)
from src.contexts.save.domain.entities import (
    CanonicalProduct,
    MatchCandidate,
    MatchCandidateSnapshot,
)
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
        self.candidate_calls: list[tuple[str, list[MatchCandidateSnapshot]]] = []

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
        judge_input_tokens: int | None = None,
        judge_output_tokens: int | None = None,
        judge_model: str | None = None,
    ) -> str:
        existing = self._by_store_product.get(store_product_id)
        if existing is not None:
            existing["canonical_product_id"] = canonical_product_id
            existing["confidence"] = confidence
            existing["method"] = method
            existing["status"] = status
            if judge_input_tokens is not None:
                existing["judge_input_tokens"] = judge_input_tokens
            if judge_output_tokens is not None:
                existing["judge_output_tokens"] = judge_output_tokens
            if judge_model is not None:
                existing["judge_model"] = judge_model
            return existing["id"]
        record = {
            "id": f"match-{len(self.records) + 1}",
            "store_product_id": store_product_id,
            "canonical_product_id": canonical_product_id,
            "confidence": confidence,
            "method": method,
            "status": status,
        }
        if judge_input_tokens is not None:
            record["judge_input_tokens"] = judge_input_tokens
        if judge_output_tokens is not None:
            record["judge_output_tokens"] = judge_output_tokens
        if judge_model is not None:
            record["judge_model"] = judge_model
        self.records.append(record)
        self._by_store_product[store_product_id] = record
        return record["id"]

    def record_candidates(
        self, match_id: str, candidates: list[MatchCandidateSnapshot]
    ) -> None:
        self.candidate_calls.append((match_id, list(candidates)))

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
    input_tokens: int | None = None
    output_tokens: int | None = None
    model: str | None = None


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


def _canonical_cat(cid: str, leaf: str) -> CanonicalProduct:
    """Canónico con una hoja de taxonomía específica (para los tests de category gate/boost)."""
    return CanonicalProduct(
        id=cid,
        name="Arroz La Garza 5lb",
        brand="La Garza",
        quantity=Quantity(Decimal("2.267"), UnitMeasure.MASS),
        taxonomy_node_id=leaf,
        market_id=MARKET,
        display_size="5 LB",
    )


def _incoming(
    *,
    store_product_id: str = "sp-1",
    name: str = "Arroz La Garza 5lb",
    brand: str = "La Garza",
    size: str = "5 LB",
    ean: str | None = None,
    source_category: str = "",
) -> IncomingStoreProduct:
    return IncomingStoreProduct(
        store_product_id=store_product_id,
        market_id=MARKET,
        name=name,
        brand=brand,
        size=size,
        ean=ean,
        source_category=source_category,
    )


def _make_use_case(
    *,
    match_repo: FakeCascadeMatchRepository | None = None,
    store_repo: FakeStoreProductLinkRepository | None = None,
    canonical_repo: FakeCanonicalProductRepository | None = None,
    embedder: FakeEmbeddingProvider | None = None,
    judge: FakeJudge | None = None,
    category_lexicon: dict[str, str] | None = None,
    leaf_to_parent: dict[str, str] | None = None,
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
        category_lexicon=category_lexicon,
        leaf_to_parent=leaf_to_parent,
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


# ---------------------------------------------------------------- category gate/boost (Etapa C) --


def test_category_conflict_routes_to_review_even_at_auto_band() -> None:
    # Score altísimo (banda auto) PERO el store es de otra categoría-padre que el canónico → la
    # señal dura de categoría bloquea el auto-link y manda a revisión (como el size_gate).
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.90)],
    )
    canonical_repo = FakeCanonicalProductRepository({"canon-1": _canonical_cat("canon-1", "leaf-arroz")})
    use_case, c = _make_use_case(
        match_repo=match_repo,
        canonical_repo=canonical_repo,
        category_lexicon={"limpieza": "leaf-limpieza", "arroz": "leaf-arroz"},
        leaf_to_parent={"leaf-limpieza": "parent-hogar", "leaf-arroz": "parent-despensa"},
    )

    result = use_case.execute(_incoming(source_category="Limpieza"))

    assert result.status == "pending_review"
    assert c["store_repo"].links == []  # NO auto-linkeado pese al score alto


def test_same_category_boost_lifts_grey_to_auto_link() -> None:
    # Score en banda gris (0.82) que SOLO alcanza auto_link con el boost de misma-hoja (+0.05).
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.82)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.80)],
    )
    canonical_repo = FakeCanonicalProductRepository({"canon-1": _canonical_cat("canon-1", "leaf-arroz")})
    use_case, c = _make_use_case(
        match_repo=match_repo,
        canonical_repo=canonical_repo,
        category_lexicon={"arroz": "leaf-arroz"},
        leaf_to_parent={"leaf-arroz": "parent-despensa"},
    )

    # brand/size que NO matchean (sin boost de marca/tamaño ni size_conflict) → aísla el category boost.
    result = use_case.execute(
        _incoming(source_category="Despensa > Arroz", brand="Otra", size="")
    )

    assert result.status == "auto_linked"


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


def test_size_conflict_blocks_deterministic_auto_link_and_goes_to_review() -> None:
    """Batch 10 size gate: aunque el score determinista supere HIGH, un tamaño que NO concuerda con
    el del canónico (distinto SKU) NUNCA auto-linkea — va a revisión. Detiene el colapso de
    1/5/20/50 Lb de un mismo arroz en un solo canónico."""
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
    )
    # canónico = 5 LB (quantity 2.267 kg); la tienda trae 20 Lb (9.07 kg) -> conflicto de tamaño
    canonical_repo = FakeCanonicalProductRepository({"canon-1": _canonical("canon-1")})
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    result = use_case.execute(_incoming(size="20 Lb"))

    assert result.status == "pending_review"
    assert result.canonical_product_id is None
    assert c["store_repo"].links == []  # NUNCA escribió el FK denormalizado


def test_size_agreement_still_auto_links() -> None:
    """Contraparte: cuando los tamaños concuerdan, el gate NO interfiere — auto-linkea normal."""
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
    )
    canonical_repo = FakeCanonicalProductRepository({"canon-1": _canonical("canon-1")})
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    result = use_case.execute(_incoming(size="5 LB"))  # 2.268 kg ≈ 2.267 kg -> concuerda

    assert result.status == "auto_linked"
    assert result.canonical_product_id == "canon-1"


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


def test_grey_band_match_verdict_at_confidence_floor_auto_links() -> None:
    # JUDGE_MATCH_MIN_CONFIDENCE = 0.70 — exactly AT the floor still auto-links (>=, not >).
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="Otra", size="Otro")}
    )
    judge = FakeJudge(FakeVerdict("match", 0.70, ["brand agrees"]))
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo, judge=judge)

    result = use_case.execute(_incoming())

    assert result.status == "auto_linked"
    assert result.method == "llm"
    assert result.confidence == 0.70
    assert c["store_repo"].links == [("sp-1", "canon-1")]


def test_grey_band_low_confidence_match_verdict_routes_to_pending_review() -> None:
    # CRITICAL-1 fix: a judge "match" BELOW the confidence floor must NOT auto-merge — sacred
    # rule #4 (nothing weakly-confident auto-merges). Routes to review instead, method="llm".
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="Otra", size="Otro")}
    )
    judge = FakeJudge(FakeVerdict("match", 0.60, ["brand agrees"]))  # < JUDGE_MATCH_MIN_CONFIDENCE
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo, judge=judge)

    result = use_case.execute(_incoming())

    assert len(judge.calls) == 1
    assert result.status == "pending_review"
    assert result.canonical_product_id is None
    assert result.method == "llm"
    assert result.confidence == 0.60
    assert c["store_repo"].links == []


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


# ---------------------------------------------------------------- 1.12: review_candidate wiring ----------


def test_below_mid_band_persists_review_candidate_snapshot() -> None:
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.30)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", name="Producto X", brand="Marca X", size="Otro")}
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    use_case.execute(_incoming())

    assert len(match_repo.candidate_calls) == 1
    match_id, snapshots = match_repo.candidate_calls[0]
    assert match_id == match_repo.records[0]["id"]
    assert snapshots == [
        MatchCandidateSnapshot(
            canonical_product_id="canon-1", score=0.30, name="Producto X", brand="Marca X"
        )
    ]


def test_grey_band_weak_match_persists_review_candidate_snapshot() -> None:
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="Otra", size="Otro")}
    )
    judge = FakeJudge(FakeVerdict("match", 0.60, ["brand agrees"]))  # below the floor -> review
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo, judge=judge)

    use_case.execute(_incoming())

    assert len(match_repo.candidate_calls) == 1
    _match_id, snapshots = match_repo.candidate_calls[0]
    assert [s.canonical_product_id for s in snapshots] == ["canon-1"]


def test_grey_band_no_match_verdict_persists_review_candidate_snapshot() -> None:
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="Otra", size="Otro")}
    )
    judge = FakeJudge(FakeVerdict("no_match", 0.10, ["brand disagrees"]))
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo, judge=judge)

    use_case.execute(_incoming())

    assert len(match_repo.candidate_calls) == 1
    _match_id, snapshots = match_repo.candidate_calls[0]
    assert [s.canonical_product_id for s in snapshots] == ["canon-1"]


def test_ean_collision_persists_both_colliding_candidates_as_snapshot() -> None:
    canonical_repo = FakeCanonicalProductRepository(
        {
            "canon-a": _canonical("canon-a", name="Arroz A", brand="Marca A"),
            "canon-b": _canonical("canon-b", name="Arroz B", brand="Marca B"),
        }
    )
    match_repo = FakeCascadeMatchRepository(
        ean_candidates=[
            MatchCandidate(canonical_product_id="canon-a", score=1.0),
            MatchCandidate(canonical_product_id="canon-b", score=1.0),
        ]
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    use_case.execute(_incoming(ean="dup-ean"))

    assert len(match_repo.candidate_calls) == 1
    _match_id, snapshots = match_repo.candidate_calls[0]
    assert {s.canonical_product_id for s in snapshots} == {"canon-a", "canon-b"}
    assert {s.name for s in snapshots} == {"Arroz A", "Arroz B"}


def test_no_candidates_case_does_not_call_record_candidates() -> None:
    match_repo = FakeCascadeMatchRepository(trgm_candidates=[], vector_candidates=[])
    use_case, c = _make_use_case(match_repo=match_repo)

    use_case.execute(_incoming())

    assert match_repo.candidate_calls == []  # nothing to snapshot — fused was empty


def test_auto_link_paths_never_persist_review_candidates() -> None:
    # EAN unique auto-link
    match_repo = FakeCascadeMatchRepository(
        ean_candidates=[MatchCandidate(canonical_product_id="canon-ean-1", score=1.0)]
    )
    use_case, _c = _make_use_case(match_repo=match_repo)

    use_case.execute(_incoming(ean="7501234567890"))

    assert match_repo.candidate_calls == []


def test_high_band_auto_link_never_persists_review_candidates() -> None:
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="Otra", size="Otro")}
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    use_case.execute(_incoming())

    assert match_repo.candidate_calls == []


def test_grey_band_strong_match_auto_link_never_persists_review_candidates() -> None:
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="Otra", size="Otro")}
    )
    judge = FakeJudge(FakeVerdict("match", 0.97, ["brand agrees"]))
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo, judge=judge)

    use_case.execute(_incoming())

    assert match_repo.candidate_calls == []


# ---------------------------------------------------------------- 1.14: judge cost wiring ----------


def test_grey_band_strong_match_wires_judge_cost_onto_auto_linked_record() -> None:
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="Otra", size="Otro")}
    )
    judge = FakeJudge(
        FakeVerdict(
            "match", 0.97, ["brand agrees"],
            input_tokens=150, output_tokens=40, model="claude-sonnet-fake",
        )
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo, judge=judge)

    use_case.execute(_incoming())

    record = match_repo.records[0]
    assert record["status"] == "auto_linked"
    assert record["judge_input_tokens"] == 150
    assert record["judge_output_tokens"] == 40
    assert record["judge_model"] == "claude-sonnet-fake"


def test_grey_band_weak_verdict_wires_judge_cost_onto_pending_review_record() -> None:
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="Otra", size="Otro")}
    )
    judge = FakeJudge(
        FakeVerdict(
            "no_match", 0.10, ["brand disagrees"],
            input_tokens=120, output_tokens=25, model="claude-sonnet-fake",
        )
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo, judge=judge)

    use_case.execute(_incoming())

    record = match_repo.records[0]
    assert record["status"] == "pending_review"
    assert record["judge_input_tokens"] == 120
    assert record["judge_output_tokens"] == 25
    assert record["judge_model"] == "claude-sonnet-fake"


def test_human_band_never_wires_judge_cost() -> None:
    # No judge was invoked at all (below MID) — record_match must not be called with a
    # judge_input_tokens/output_tokens/model key (they'd all be None; the fake only sets a
    # key when the value isn't None — so absence of the key IS the assertion).
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.30)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="Otra", size="Otro")}
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    use_case.execute(_incoming())

    record = match_repo.records[0]
    assert "judge_input_tokens" not in record
    assert "judge_output_tokens" not in record
    assert "judge_model" not in record
