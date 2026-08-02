"""Unit — MatchStoreProduct (F2.0 cascada de matching, application layer). PURA (fakes, sin DB
ni LLM real): EAN exacto -> trgm/vector fusionados por RRF -> boosts -> banding -> LLM judge
(solo banda gris) -> cola humana. Ver design §Cascade Contract.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

import pytest

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
        run_id: str | None = None,
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
            "run_id": run_id,
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
    """Fake del escritor del FK denormalizado (store_product.canonical_product_id) + la consulta
    del EAN conocido de un canónico (gate de falso-merge EAN-negativo)."""

    def __init__(
        self,
        canonical_eans: dict[str, str] | None = None,
        provider_siblings: set[tuple[str, str]] | None = None,
    ) -> None:
        self.links: list[tuple[str, str]] = []
        # canonical_product_id -> un EAN conocido de alguno de sus store_products enlazados
        # ({} = ninguno tiene EAN conocido → sin señal negativa).
        self._canonical_eans = canonical_eans or {}
        # (canonical_product_id, provider_id) que YA tienen un store_product enlazado.
        self._provider_siblings = provider_siblings or set()

    def link_to_canonical(self, store_product_id: str, canonical_product_id: str) -> None:
        self.links.append((store_product_id, canonical_product_id))

    def find_ean_for_canonical(self, canonical_product_id: str) -> str | None:
        return self._canonical_eans.get(canonical_product_id)

    def has_other_product_from_provider(
        self, canonical_product_id: str, provider_id: str, excluding_store_product_id: str
    ) -> bool:
        return (canonical_product_id, provider_id) in self._provider_siblings


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
    # ¿El juez emitió este veredicto, o es nuestro fail-safe? (breaker abierto / API caída /
    # salida ilegible). Solo el adapter puede saberlo.
    degraded: bool = False


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
    """Canónico de prueba. Por defecto CONCUERDA con `_incoming()` en nombre/marca/tamaño.

    Para anular los boosts y dejar el score crudo predecible, pasá `brand="", size="Otro"` — un
    canónico SIN marca no gana boost (`_exact_match` corta ante candidato vacío) y tampoco exige
    corroboración al brand gate. NO uses una marca ajena (`brand="Otra"`): eso ya no describe
    "sin boost" sino un merge ENTRE MARCAS DISTINTAS, que el brand gate bloquea — y con razón.
    """
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
    run_id: str | None = None,
    provider_id: str = "p-sirena",
) -> IncomingStoreProduct:
    return IncomingStoreProduct(
        store_product_id=store_product_id,
        market_id=MARKET,
        name=name,
        brand=brand,
        size=size,
        ean=ean,
        source_category=source_category,
        run_id=run_id,
        provider_id=provider_id,
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
    no_judge: bool = False,
) -> tuple[MatchStoreProduct, dict]:
    match_repo = match_repo or FakeCascadeMatchRepository()
    store_repo = store_repo or FakeStoreProductLinkRepository()
    canonical_repo = canonical_repo or FakeCanonicalProductRepository({})
    embedder = embedder or FakeEmbeddingProvider()
    judge = None if no_judge else (judge or FakeJudge(FakeVerdict("uncertain", 0.0, [])))
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
            "run_id": None,
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
        {"canon-y": _canonical("canon-y", brand="", size="1 KG")}
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


# ---------------------------------------------------------------- EAN-negative gate (falso-merge) --
# Medido 2026-07-16: 11 falsos merges auto_linked (Garbanzos→Habichuela Verde, Leche de Coco→
# Habichuela Roja Coco…), todos misma marca+tamaño ("La Famosa 15 Oz") con contenido DISTINTO.
# El boost marca(+0.10)+tamaño(+0.05) empujaba sobre HIGH, y el size_gate no dispara (tamaños
# COINCIDEN). El EAN probaba que eran SKUs distintos y la cascada lo ignoraba: EAN-exacto solo era
# señal POSITIVA. Regla nueva (SACRA #4): dos EANs no-nulos DISTINTOS ⇒ NUNCA auto-link.


def test_ean_conflict_blocks_deterministic_auto_link_and_goes_to_review() -> None:
    # El entrante trae un EAN que NO matchea ningún canónico enlazado (cae a léxico/semántico), pero
    # el canónico ganador YA tiene un EAN conocido DISTINTO → son productos distintos. Aunque el
    # score supere HIGH, va a revisión — nunca auto-link.
    match_repo = FakeCascadeMatchRepository(
        ean_candidates=[],  # el EAN entrante no resuelve por barcode → sigue a léxico
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
    )
    canonical_repo = FakeCanonicalProductRepository({"canon-1": _canonical("canon-1")})
    store_repo = FakeStoreProductLinkRepository(canonical_eans={"canon-1": "00760593022949"})
    use_case, c = _make_use_case(
        match_repo=match_repo, canonical_repo=canonical_repo, store_repo=store_repo
    )

    result = use_case.execute(_incoming(ean="00760593022918"))  # EAN distinto al del canónico

    assert result.status == "pending_review"
    assert result.canonical_product_id is None
    assert c["store_repo"].links == []  # NUNCA escribió el FK denormalizado


def test_matching_ean_still_auto_links_via_lexical_when_names_agree() -> None:
    # Contraparte: si el EAN conocido del canónico COINCIDE con el entrante, no hay conflicto — el
    # auto-link por nombre procede (es el MISMO producto; el barcode lo confirma).
    match_repo = FakeCascadeMatchRepository(
        ean_candidates=[],
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
    )
    canonical_repo = FakeCanonicalProductRepository({"canon-1": _canonical("canon-1")})
    store_repo = FakeStoreProductLinkRepository(canonical_eans={"canon-1": "00760593022918"})
    use_case, c = _make_use_case(
        match_repo=match_repo, canonical_repo=canonical_repo, store_repo=store_repo
    )

    result = use_case.execute(_incoming(ean="00760593022918"))  # mismo EAN → sin conflicto

    assert result.status == "auto_linked"
    assert c["store_repo"].links == [("sp-1", "canon-1")]


def test_no_known_canonical_ean_does_not_block_name_auto_link() -> None:
    # Sin señal negativa: si el canónico ganador NO tiene ningún EAN conocido, no podemos probar que
    # difieran → el gate no interfiere y el auto-link por nombre procede (caso Magento-only, sin barcode).
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
    )
    canonical_repo = FakeCanonicalProductRepository({"canon-1": _canonical("canon-1")})
    store_repo = FakeStoreProductLinkRepository(canonical_eans={})  # canónico sin EAN conocido
    use_case, c = _make_use_case(
        match_repo=match_repo, canonical_repo=canonical_repo, store_repo=store_repo
    )

    result = use_case.execute(_incoming(ean="00760593022918"))

    assert result.status == "auto_linked"
    assert c["store_repo"].links == [("sp-1", "canon-1")]


def test_incoming_without_ean_never_triggers_the_gate() -> None:
    # El gate SOLO aplica cuando el entrante trae EAN. Sin EAN, no hay barcode que contrastar →
    # auto-link normal aunque el canónico tenga un EAN conocido.
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
    )
    canonical_repo = FakeCanonicalProductRepository({"canon-1": _canonical("canon-1")})
    store_repo = FakeStoreProductLinkRepository(canonical_eans={"canon-1": "00760593022949"})
    use_case, c = _make_use_case(
        match_repo=match_repo, canonical_repo=canonical_repo, store_repo=store_repo
    )

    result = use_case.execute(_incoming(ean=None))

    assert result.status == "auto_linked"
    assert c["store_repo"].links == [("sp-1", "canon-1")]


def test_ean_conflict_persists_review_candidate_snapshot() -> None:
    # Bloqueado por EAN sigue siendo un pending_review: el revisor necesita ver el/los candidato(s).
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1")}
    )
    store_repo = FakeStoreProductLinkRepository(canonical_eans={"canon-1": "00760593022949"})
    use_case, c = _make_use_case(
        match_repo=match_repo, canonical_repo=canonical_repo, store_repo=store_repo
    )

    use_case.execute(_incoming(ean="00760593022918"))

    assert len(match_repo.candidate_calls) == 1
    _match_id, snapshots = match_repo.candidate_calls[0]
    assert [s.canonical_product_id for s in snapshots] == ["canon-1"]


def test_ean_conflict_blocks_grey_band_judge_auto_link() -> None:
    # Defensa para cuando el LLM se re-encienda: aun si el juez dice "match" con alta confianza, un
    # EAN conocido distinto en el canónico gana — dos barcodes distintos son SKUs distintos.
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="", size="Otro")}
    )
    store_repo = FakeStoreProductLinkRepository(canonical_eans={"canon-1": "00760593022949"})
    judge = FakeJudge(FakeVerdict("match", 0.97, ["brand agrees"]))
    use_case, c = _make_use_case(
        match_repo=match_repo, canonical_repo=canonical_repo, store_repo=store_repo, judge=judge
    )

    result = use_case.execute(_incoming(ean="00760593022918"))

    assert result.status == "pending_review"
    assert result.canonical_product_id is None
    assert c["store_repo"].links == []


# ---------------------------------------------------------------- variant gate (falso-merge sin EAN) --
# El EAN gate cubre el falso-merge SOLO donde hay barcode. En Magento (Jumbo/Nacional, sin EAN) un
# cruce de VARIANTE (pinta→negra, roja→pinta) auto-linkeaba: marca+tamaño coinciden, solo el
# contenido difiere, y el size_gate no dispara (tamaños iguales). Medido 2026-07-16: 3 casos.


def test_variant_conflict_blocks_auto_link_even_at_high_band() -> None:
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
    )
    # size "5 LB" == la quantity del canónico (2.267 kg) → aísla el variant gate del size_gate.
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", name="Habichuelas Negras La Sanjuanera", brand="La Sanjuanera")}
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    result = use_case.execute(
        _incoming(name="Habichuela Pinta La Sanjuanera", brand="La Sanjuanera", size="5 LB")
    )

    assert result.status == "pending_review"
    assert result.canonical_product_id is None
    assert c["store_repo"].links == []  # pinta ≠ negra: distinto SKU


def test_same_variant_still_auto_links() -> None:
    # Contraparte: mismo color → el gate no interfiere.
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", name="Habichuelas Rojas La Famosa", brand="La Famosa")}
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    result = use_case.execute(
        _incoming(name="Habichuelas Rojas La Famosa", brand="La Famosa", size="5 LB")
    )

    assert result.status == "auto_linked"
    assert c["store_repo"].links == [("sp-1", "canon-1")]


def test_legume_species_conflict_blocks_auto_link_when_color_matches() -> None:
    """El falso positivo medido 2026-07-21 (aispace-men #822): `LA FAMOSA GANDULES VERDES 15 OZ`
    auto-linkeó a `Habichuela Verde La Famosa 15 Oz` en 0.854. Marca, tamaño y COLOR coinciden —
    el grupo color del variant gate no podía verlo. Solo difiere la ESPECIE, y trgm (difieren en
    UN token) y el vector (ambos legumbre enlatada) coincidieron en equivocarse, así que el
    consenso RRF reforzó el error. El gandul correcto existía en el catálogo pero en otro tamaño:
    NO había canónico correcto, así que el destino legítimo era la cola.

    Tamaño "5 LB" == la quantity del canónico → aísla el gate del size_gate, como el test de color.
    """
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", name="Habichuela Verde La Famosa", brand="La Famosa")}
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    result = use_case.execute(
        _incoming(name="LA FAMOSA GANDULES VERDES", brand="La Famosa", size="5 LB")
    )

    assert result.status == "pending_review"
    assert result.canonical_product_id is None
    assert c["store_repo"].links == []  # gandul ≠ habichuela: distinto SKU


def test_regional_synonym_of_the_same_legume_still_auto_links() -> None:
    # Contraparte OBLIGATORIA: frijol ES habichuela (regionalismo, no especie distinta). Si el gate
    # los separara, rompería matches BUENOS — el error inverso al que existe para evitar.
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", name="Habichuelas Negras Goya", brand="Goya")}
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    result = use_case.execute(_incoming(name="Frijoles Negros Goya", brand="Goya", size="5 LB"))

    assert result.status == "auto_linked"
    assert c["store_repo"].links == [("sp-1", "canon-1")]


# ---------------------------------------------------------------- brand gate (sin evidencia de marca) --
# `ARROZ SELECTO 10 LB` de Bravo auto-linkeó a `Arroz Selecto Wala 10 Lb` en 0.850 (medido
# 2026-07-21, aispace-men #822): Bravo no declara marca y su nombre no nombra a Wala, o sea CERO
# evidencia — pero las cadenas difieren en UN token (el de la marca) y el parecido bastó. Mismo
# mecanismo que gandules→habichuela, otro eje. A diferencia de los demás gates, éste bloquea por
# AUSENCIA de evidencia y no por contradicción; ver el docstring de `brand_gate`.


def test_no_brand_evidence_blocks_auto_link_into_a_branded_canonical() -> None:
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", name="Arroz Selecto Wala", brand="Wala")}
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    result = use_case.execute(_incoming(name="ARROZ SELECTO 10 LB", brand="", size="5 LB"))

    assert result.status == "pending_review"
    assert result.canonical_product_id is None
    assert c["store_repo"].links == []  # nada prueba que ese arroz sea Wala


def test_brand_named_only_in_the_store_name_still_auto_links() -> None:
    # Contraparte OBLIGATORIA: Bravo/Nacional no declaran marca pero la ESCRIBEN en el nombre. Éstos
    # son los matches BUENOS de la corrida medida (`LA FAMOSA HABICHUELAS…` 1.000) — no romperlos es
    # justo lo que hace viable bloquear por ausencia de evidencia.
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", name="Habichuelas Negras La Famosa", brand="La Famosa")}
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    result = use_case.execute(
        _incoming(name="LA FAMOSA HABICHUELAS NEGRAS", brand="", size="5 LB")
    )

    assert result.status == "auto_linked"
    assert c["store_repo"].links == [("sp-1", "canon-1")]


def test_generic_canonical_without_brand_is_never_gated() -> None:
    # Produce suelto / pan de la casa: no hay marca que exigir → el gate no debe entrometerse.
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", name="Platano Barahonero", brand="")}
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    result = use_case.execute(
        _incoming(name="PLATANO BARAHONERO UNIDAD", brand="", size="5 LB")
    )

    assert result.status == "auto_linked"
    assert c["store_repo"].links == [("sp-1", "canon-1")]


# ------------------------------------------------- proveedor único (una tienda no vende lo mismo 2x) --
# Medido 2026-08-01: de 61 auto-enlaces, CINCO canónicos habían absorbido SKUs distintos de la MISMA
# tienda. Los ejes eran cuatro y todos distintos (línea de calidad, seco/verde, con vegetales, estilo
# americano) — perseguirlos de a uno es una carrera sin final. Este invariante los cubre TODOS, y
# también los ejes que no se nos ocurrieron: una tienda no publica el mismo producto dos veces, así
# que un segundo SKU sobre el mismo canónico es, por construcción, otro producto.


def test_a_second_sku_from_the_same_provider_never_auto_links() -> None:
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
    )
    canonical_repo = FakeCanonicalProductRepository({"canon-1": _canonical("canon-1")})
    # canon-1 ya tiene un producto de p-nacional (el "Guandules Secos con Coco" que llegó primero).
    store_repo = FakeStoreProductLinkRepository(provider_siblings={("canon-1", "p-nacional")})
    use_case, c = _make_use_case(
        match_repo=match_repo, canonical_repo=canonical_repo, store_repo=store_repo
    )

    result = use_case.execute(_incoming(provider_id="p-nacional"))

    assert result.status == "pending_review"
    assert c["store_repo"].links == []


def test_a_first_sku_from_that_provider_still_auto_links() -> None:
    # Contraparte: el invariante NO puede impedir el primer enlace de cada tienda — que es
    # justamente lo que hace comparable un canónico entre supermercados.
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
    )
    canonical_repo = FakeCanonicalProductRepository({"canon-1": _canonical("canon-1")})
    # canon-1 tiene productos de OTRA tienda: eso no estorba.
    store_repo = FakeStoreProductLinkRepository(provider_siblings={("canon-1", "p-sirena")})
    use_case, c = _make_use_case(
        match_repo=match_repo, canonical_repo=canonical_repo, store_repo=store_repo
    )

    result = use_case.execute(_incoming(provider_id="p-nacional"))

    assert result.status == "auto_linked"
    assert c["store_repo"].links == [("sp-1", "canon-1")]


# ---------------------------------------------------------------- quality gate (línea de calidad) --
# Medido 2026-08-01 en la primera corrida con catálogo poblado: `Arroz Pimco Selecto 10 Lbs` había
# absorbido TRES SKUs distintos de Nacional (Premium, Selecto, Super Selecto Gourmet) — una tienda
# no vende el mismo producto tres veces. Llegaban a confianza 1.000: misma marca + mismo tamaño +
# misma categoría hacen que los tres boosts empujen al tope justo a esta clase de error.


def test_a_different_quality_line_blocks_auto_link_at_the_top_of_the_band() -> None:
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", name="Arroz Pimco Selecto", brand="Pimco")}
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    result = use_case.execute(
        _incoming(name="Arroz Premium Pimco Funda", brand="Pimco", size="5 LB")
    )

    assert result.status == "pending_review"
    assert c["store_repo"].links == []  # Premium ≠ Selecto: distinto SKU


def test_super_selecto_is_not_selecto() -> None:
    # El caso que un match por token suelto NO ve: los dos nombres contienen "selecto".
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", name="Arroz Pimco Selecto", brand="Pimco")}
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    result = use_case.execute(
        _incoming(name="Arroz Super Selecto Pimco", brand="Pimco", size="5 LB")
    )

    assert result.status == "pending_review"
    assert c["store_repo"].links == []


def test_the_same_quality_line_still_auto_links() -> None:
    # Contraparte OBLIGATORIA: de los 3 SKUs fusionados, éste era el enlace BUENO.
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
        vector_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.95)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", name="Arroz Pimco Selecto", brand="Pimco")}
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    result = use_case.execute(_incoming(name="Arroz Selecto Pimco", brand="Pimco", size="5 LB"))

    assert result.status == "auto_linked"
    assert c["store_repo"].links == [("sp-1", "canon-1")]


def test_no_brand_evidence_blocks_grey_band_judge_auto_link() -> None:
    # Defensa para cuando el LLM se re-encienda, igual que el EAN gate: el juez puede decir "match"
    # con alta confianza, pero sin evidencia de marca no se auto-mergea en un SKU de marca.
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", name="Arroz Selecto Wala", brand="Wala")}
    )
    judge = FakeJudge(FakeVerdict("match", 0.97, ["name agrees"]))
    use_case, c = _make_use_case(
        match_repo=match_repo, canonical_repo=canonical_repo, judge=judge
    )

    result = use_case.execute(_incoming(name="ARROZ SELECTO 10 LB", brand="", size="5 LB"))

    assert result.status == "pending_review"
    assert result.canonical_product_id is None
    assert c["store_repo"].links == []


def test_grey_band_invokes_judge_and_auto_links_on_match_verdict() -> None:
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="", size="Otro")}
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
        {"canon-1": _canonical("canon-1", brand="", size="Otro")}
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
        {"canon-1": _canonical("canon-1", brand="", size="Otro")}
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
        {"canon-1": _canonical("canon-1", brand="", size="Otro")}
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
        {"canon-1": _canonical("canon-1", brand="", size="Otro")}
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
        {"canon-1": _canonical("canon-1", brand="", size="Otro")}
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
        {"canon-1": _canonical("canon-1", brand="", size="Otro")}
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    use_case.execute(_incoming())

    assert match_repo.candidate_calls == []


def test_grey_band_strong_match_auto_link_never_persists_review_candidates() -> None:
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="", size="Otro")}
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
        {"canon-1": _canonical("canon-1", brand="", size="Otro")}
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
        {"canon-1": _canonical("canon-1", brand="", size="Otro")}
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


# ── LLM apagado: la banda gris cae a revisión SIN llamar a nadie ──────────────────────────────
# El circuit-breaker es REACTIVO: corta recién tras 3 fallos, o sea después de comerse 3 llamadas
# y 3 tracebacks. Cuando ya SABÉS que no querés LLM (cuota agotada, correr barato, medir la
# cascada determinista sola), hace falta un switch PREVENTIVO: `judge=None`.


def test_grey_band_without_a_judge_goes_to_review_as_human_not_llm() -> None:
    # El `method` NO puede ser "llm": el juez nunca corrió. Registrarlo como "llm" mentiría en la
    # misma distinción que defiende el comentario de CRITICAL-1 ("el judge SÍ corrió, solo no fue
    # lo bastante seguro") — mirarías la cola y creerías que el LLM dudó de N productos.
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="Otra", size="Otro")}
    )
    use_case, c = _make_use_case(
        match_repo=match_repo, canonical_repo=canonical_repo, judge=None, no_judge=True
    )

    result = use_case.execute(_incoming())

    assert result.status == "pending_review"
    assert result.method == "human", "sin juez, la decisión es del humano — no del LLM"
    assert result.canonical_product_id is None
    assert c["store_repo"].links == [], "NADA se auto-enlaza sin juez"


def test_ean_and_high_band_still_work_with_the_judge_off() -> None:
    # Apagar el LLM NO apaga la cascada determinista: el EAN exacto sigue auto-enlazando gratis.
    # Es justamente el modo que sirve cuando no hay cuota.
    match_repo = FakeCascadeMatchRepository(
        ean_candidates=[MatchCandidate(canonical_product_id="canon-1", score=1.0)],
    )
    use_case, c = _make_use_case(match_repo=match_repo, judge=None, no_judge=True)

    result = use_case.execute(_incoming(ean="7460083780146"))

    assert result.status == "auto_linked"
    assert result.method == "ean"
    assert result.confidence == 1.0


# ── El breaker mentiroso: un veredicto degradado NO es señal del juez (2026-07-16) ─────────────
# `method` responde a UNA pregunta: ¿quién decidió que esto va a revisión? Con el breaker abierto el
# `LlmJudge` devolvía `uncertain` SIN llamar la API, y el use-case lo registraba como `method="llm"`.
# Medido 2026-07-15: de 11 `pending_review/llm`, el LLM nunca vio 8 → mirarías la cola creyendo que
# el juez dudó de 11 productos y "afinarías el juez" sobre una señal que jamás emitió.
#
# La regla: `method="llm"` ⟺ el juez emitió un veredicto VÁLIDO y actuamos sobre él. Todo lo demás
# es la cascada determinista cayendo a la red humana → `method="human"`, que es la semántica que ya
# tiene el camino "juez apagado".
#
# Hoy está latente (`SAVE_LLM_JUDGE_ENABLED=false`: sin juez no hay breaker). Se arregla ANTES de
# re-encender el LLM, no después — si no, la primera cola con el juez vivo ya viene contaminada.


def _grey_band_with(verdict: FakeVerdict):  # type: ignore[no-untyped-def]
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        # `brand=""` (no una marca ajena): la forma DOCUMENTADA de anular los boosts sin activar el
        # brand gate — ver el docstring de `_canonical`. Con `brand="Otra"` estos tests no probaban
        # la banda gris sino un par ya VETADO por marca, y desde que los gates se evalúan antes del
        # juez ese par ni siquiera llega a consultarlo.
        {"canon-1": _canonical("canon-1", brand="", size="Otro")}
    )
    judge = FakeJudge(verdict)
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo, judge=judge)
    return use_case.execute(_incoming()), c


def test_a_degraded_verdict_is_recorded_as_human_not_llm() -> None:
    # Breaker abierto / API caída: el juez NUNCA vio este par. Decir `llm` sería mentir en la misma
    # distinción que CRITICAL-1 defiende.
    result, _ = _grey_band_with(FakeVerdict("uncertain", 0.0, [], degraded=True))

    assert result.status == "pending_review"
    assert result.method == "human"


def test_a_genuine_uncertain_verdict_is_still_recorded_as_llm() -> None:
    # El contraste que le da sentido al flag: acá el juez SÍ corrió y SÍ dudó. Esa es una señal
    # legítima suya y la cola debe poder decir "el juez miró esto y no se decidió".
    result, _ = _grey_band_with(FakeVerdict("uncertain", 0.4, ["size"], degraded=False))

    assert result.status == "pending_review"
    assert result.method == "llm"


def test_a_degraded_verdict_still_keeps_the_candidates_for_the_human() -> None:
    # Cambia quién firma la decisión, no lo que el revisor necesita para decidir.
    result, c = _grey_band_with(FakeVerdict("uncertain", 0.0, [], degraded=True))

    assert result.method == "human"
    assert c["match_repo"].candidate_calls, "el humano se queda sin candidatos que revisar"


# ------------------------------------------- F4 #4.5: la cascada estampa la corrida en el match --
# Test de WIRING, no de unidad: que `ProductMatch.run_id` EXISTA no sirve si la cascada no lo
# escribe. Lección que costó 429s reales — `round_robin_by_store` decía proteger de rate-limits y la
# pausa nunca se conectó porque nadie testeó el cableado.


def test_an_auto_linked_match_carries_the_run_that_produced_it() -> None:
    match_repo = FakeCascadeMatchRepository(
        ean_candidates=[MatchCandidate(canonical_product_id="c-1", score=1.0)]
    )
    use_case, collab = _make_use_case(match_repo=match_repo, no_judge=True)

    result = use_case.execute(_incoming(run_id="run-x", ean="00041331020053"))

    assert result.status == "auto_linked"
    assert result.run_id == "run-x"
    assert collab["match_repo"].records[-1]["run_id"] == "run-x"  # y llegó al repo, no solo al DTO


def test_a_queued_match_carries_the_run_so_the_queue_can_be_filtered_by_it() -> None:
    use_case, collab = _make_use_case(no_judge=True)  # sin candidatos → cola humana

    result = use_case.execute(_incoming(run_id="run-x"))

    assert result.status == "pending_review"
    assert result.run_id == "run-x"  # sin esto el deep-link `?run_id=` no tendría por dónde agarrar
    assert collab["match_repo"].records[-1]["run_id"] == "run-x"


def test_a_match_outside_a_run_has_no_run_id() -> None:
    # Un match creado a mano desde el admin no nace de una corrida: `None` es legítimo.
    use_case, _ = _make_use_case(no_judge=True)

    assert use_case.execute(_incoming(run_id=None)).run_id is None


# ------------------------- un gate que veta se resuelve SIN pagar el juez (medido 2026-08-01) --
#
# Los gates son vetos DETERMINISTAS: si alguno se activa, el par va a revisión sea cual sea el
# veredicto. Llamar al juez ahí no cambia el desenlace — sólo gasta tokens y latencia.
#
# Medido sobre la cola real (334 pendientes) justo antes de encender `SAVE_LLM_JUDGE_ENABLED`:
# de los 158 pares en banda gris, **152 (96.2%) tenían al menos un gate activo** — es decir, 152
# de cada 158 llamadas al juez habrían tenido el resultado predeterminado. Desglose: brand 133,
# size 83, provider_dup 31, quality 10, variant 8 (no excluyentes).
#
# Estos tests fijan el orden: gates primero, juez sólo sobre lo que el juez puede decidir.


def test_missing_brand_evidence_resolves_without_paying_for_a_judge_call() -> None:
    # El gate más frecuente de la medición (133/158). Mismo caso que
    # `test_no_brand_evidence_blocks_grey_band_judge_auto_link`, que ya fija el DESENLACE; este
    # fija el COSTO: el juez ni siquiera se consulta.
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", name="Arroz Selecto Wala", brand="Wala")}
    )
    judge = FakeJudge(FakeVerdict("match", 0.97, ["name agrees"]))
    use_case, _ = _make_use_case(
        match_repo=match_repo, canonical_repo=canonical_repo, judge=judge
    )

    result = use_case.execute(_incoming(name="ARROZ SELECTO 10 LB", brand="", size="5 LB"))

    assert judge.calls == []  # el veredicto no podía cambiar nada: no se paga
    assert result.status == "pending_review"


def test_a_size_conflict_resolves_without_paying_for_a_judge_call() -> None:
    # Segundo gate más frecuente (83/158). Tamaños comparables y en conflicto = SKU distinto.
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="", size="Otro")}
    )
    judge = FakeJudge(FakeVerdict("match", 0.97, ["name agrees"]))
    use_case, _ = _make_use_case(
        match_repo=match_repo, canonical_repo=canonical_repo, judge=judge
    )

    # El canónico pesa 2.267 kg (5 lb); el entrante declara 20 LB → conflicto duro de tamaño.
    result = use_case.execute(_incoming(size="20 LB"))

    assert judge.calls == []
    assert result.status == "pending_review"


def test_a_second_sku_from_the_same_provider_resolves_without_paying_for_a_judge_call() -> None:
    # El invariante ESTRUCTURAL (31/158): una tienda no publica el mismo producto dos veces.
    # No hay nada que un LLM pueda aportar sobre un hecho de la base de datos.
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="", size="Otro")}
    )
    store_repo = FakeStoreProductLinkRepository(
        provider_siblings={("canon-1", "p-sirena")}
    )
    judge = FakeJudge(FakeVerdict("match", 0.97, ["name agrees"]))
    use_case, _ = _make_use_case(
        match_repo=match_repo,
        canonical_repo=canonical_repo,
        store_repo=store_repo,
        judge=judge,
    )

    result = use_case.execute(_incoming())

    assert judge.calls == []
    assert result.status == "pending_review"


def test_a_gate_vetoed_pair_is_recorded_as_human_with_the_cascade_score() -> None:
    """Un par vetado por un gate se registra con la MISMA semántica que el camino "juez apagado".

    `method="human"` porque el juez no dictaminó — es la distinción que ya defienden el camino
    `judge is None` y el camino `degraded`: `llm` debe significar "el juez falló el caso", nunca
    "el juez estuvo presente pero su opinión daba igual". Y la confianza es la de la CASCADA
    (score fusionado + boosts), no la de un veredicto que no se pidió.

    Sin esto, la cola mostraría `method="llm"` en pares que el LLM nunca decidió, y las columnas
    de costo (`judge_*`) atribuirían tokens a una llamada que no ocurrió.
    """
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", name="Arroz Selecto Wala", brand="Wala")}
    )
    judge = FakeJudge(FakeVerdict("match", 0.97, ["name agrees"], input_tokens=120, model="gpt-4o"))
    use_case, c = _make_use_case(
        match_repo=match_repo, canonical_repo=canonical_repo, judge=judge
    )

    result = use_case.execute(_incoming(name="ARROZ SELECTO 10 LB", brand="", size="5 LB"))

    assert judge.calls == []
    assert result.method == "human"
    # Score de la cascada (0.60 crudo + 0.05 del boost de tamaño exacto), NO el 0.97 del juez.
    assert result.confidence == pytest.approx(0.65)
    record = c["match_repo"].records[-1]
    assert record["method"] == "human"
    assert "judge_input_tokens" not in record  # no se gastaron tokens: no se reportan
    assert "judge_model" not in record


def test_a_clean_grey_band_pair_still_reaches_the_judge() -> None:
    # La contracara: sin ningún gate activo, el juez SIGUE siendo quien decide. La optimización
    # recorta llamadas inútiles, no la banda gris — son los 6 de 158 que sí necesitan criterio
    # (p.ej. `GOYA ARROZ INTEGRAL 32 OZ` vs `Arroz Goya Integral 2 Lb.`, donde 32 oz == 2 lb).
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="", size="Otro")}
    )
    judge = FakeJudge(FakeVerdict("match", 0.97, ["brand agrees"]))
    use_case, c = _make_use_case(
        match_repo=match_repo, canonical_repo=canonical_repo, judge=judge
    )

    result = use_case.execute(_incoming())

    assert len(judge.calls) == 1
    assert result.status == "auto_linked"
    assert result.method == "llm"
    assert c["store_repo"].links == [("sp-1", "canon-1")]


# ---------------------------------- form gate (forma de preparación, medido 2026-08-01) --
#
# 8.º gate. La FORMA distingue SKUs que comparten marca, tamaño, categoría, color y especie:
# harina de arroz no es arroz; habichuelas guisadas no son secas. Los 3 falsos merges de la primera
# corrida con el juez encendido: dos los produjo el JUEZ (0.850) y uno la cascada DETERMINISTA
# (hybrid, 0.902) — el eje falla en los dos caminos. Ver `cascade/form_gate.py`.


def test_a_different_preparation_blocks_auto_link_at_the_top_of_the_band() -> None:
    # El caso `Guandules Verdes Guisados Goya` → `Guandules Verdes Goya`: la cascada lo auto-enlazó
    # con 0.902 porque marca, tamaño, color y especie COINCIDEN. Sólo difiere la preparación.
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.90)],
    )
    canonical_repo = FakeCanonicalProductRepository({"canon-1": _canonical("canon-1")})
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    result = use_case.execute(_incoming(name="Arroz Guisado La Garza 5lb"))

    assert result.status == "pending_review"
    assert result.canonical_product_id is None
    assert c["store_repo"].links == [], "una preparación distinta NUNCA auto-enlaza"


def test_harina_never_auto_links_into_the_plain_grain() -> None:
    # `GOYA HARINA ARROZ 24OZ` → `Arroz Goya Valencia 24 Oz`, el falso merge que el juez firmó
    # con 0.850. Acá se prueba por el camino determinista: ni siquiera debe llegar a la banda gris.
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.90)],
    )
    canonical_repo = FakeCanonicalProductRepository({"canon-1": _canonical("canon-1")})
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    result = use_case.execute(_incoming(name="Harina de Arroz La Garza 5lb"))

    assert result.status == "pending_review"
    assert c["store_repo"].links == []


def test_the_same_preparation_still_auto_links() -> None:
    # La contracara obligatoria: dos harinas SÍ son el mismo SKU. Sin esto el gate podría estar
    # bloqueando todo y los tests de arriba seguirían pasando.
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.90)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", name="Harina de Arroz La Garza 5lb")}
    )
    use_case, c = _make_use_case(match_repo=match_repo, canonical_repo=canonical_repo)

    result = use_case.execute(_incoming(name="HARINA ARROZ LA GARZA 5LB"))

    assert result.status == "auto_linked"
    assert c["store_repo"].links == [("sp-1", "canon-1")]


def test_a_form_conflict_resolves_without_paying_for_a_judge_call() -> None:
    # El gate nuevo entra al mismo corte que los otros 7: en banda gris se resuelve sin consultar
    # al juez, porque su veredicto no podría levantar el veto.
    match_repo = FakeCascadeMatchRepository(
        trgm_candidates=[MatchCandidate(canonical_product_id="canon-1", score=0.60)],
    )
    canonical_repo = FakeCanonicalProductRepository(
        {"canon-1": _canonical("canon-1", brand="", size="Otro")}
    )
    judge = FakeJudge(FakeVerdict("match", 0.97, ["name agrees"]))
    use_case, _ = _make_use_case(
        match_repo=match_repo, canonical_repo=canonical_repo, judge=judge
    )

    result = use_case.execute(_incoming(name="Harina de Arroz La Garza 5lb"))

    assert judge.calls == []
    assert result.status == "pending_review"
