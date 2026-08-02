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
from src.contexts.save.infrastructure.classification.lexicon import build_lexicon_index

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


def _make(classifications, candidates, embedder, judge, lexicon=None, leaf_names=None):  # type: ignore[no-untyped-def]
    return ClassifyStoreProduct(
        classifications, candidates, embedder, judge, lexicon or {}, leaf_names=leaf_names
    )


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
    # El índice se construye con `build_lexicon_index`, no a mano: desde que `_tokens` normaliza el
    # número gramatical, las llaves del índice son la forma SINGULAR («conserva», no «conservas»).
    # Un dict escrito a mano con las formas de superficie ya no representa lo que produce
    # producción, y el test pasaría o fallaría por un detalle del fixture, no por la conducta.
    lexicon = build_lexicon_index([
        ("n-enlatados", "Conservas Enlatados"),
        ("n-vegetales", "Vegetales"),
        ("n-legumbres", "Legumbres"),
    ])
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


# ------------------- la cascada REGISTRA lo que decidió, incluido cuando NO decidió --
#
# Medido 2026-08-01: de 292 store_products, 89 (31%) quedaron sin clasificar. Averiguar POR QUÉ
# exigió reproducir `decide()` producto por producto, llamando al LLM de nuevo — porque las dos
# ramas de abstención (`_CONFLICT` y `_UNCLASSIFIED`) no persisten NADA: `execute` sólo escribe si
# hay hoja. El caso más informativo del sistema —dos señales fuertes en desacuerdo— es justamente
# el que no deja rastro.
#
# El registro NO relaja la regla sagrada: no se inventa una categoría para poder guardar una fila.
# La decisión se guarda con `taxonomy_node_id=None` en una tabla propia, separada de
# `category_classification` (cuya hoja es NOT NULL a propósito, porque ahí viven las categorías
# ASIGNADAS). Una abstención registrada sigue siendo una abstención.
#
# El recorder es un colaborador OPCIONAL (`None` = no registrar), igual que el juez y el lexicon:
# apagarlo no cambia ninguna decisión.


class _FakeDecisions:
    def __init__(self) -> None:
        self.recorded: list = []

    def record(self, decision) -> None:  # type: ignore[no-untyped-def]
        self.recorded.append(decision)


def test_a_conflict_records_both_competing_leaves_instead_of_vanishing() -> None:
    # El 62% de las abstenciones. La tienda dice una hoja y el nombre dice otra; hoy eso se
    # descarta y sólo se puede recuperar re-corriendo la cascada.
    cls, dec = _FakeClassifications(), _FakeDecisions()
    lexicon = build_lexicon_index([
        ("n-mascotas", "Alimento Para Perro"),
        ("n-arroz", "Arroz, Granos & Legumbres"),
    ])
    uc = ClassifyStoreProduct(
        cls, _FakeCandidates(), _FakeEmbedder(), _FakeJudge(), lexicon, decisions=dec
    )

    # El nombre NO nombra al perro: si lo hiciera, la señal de nombre sería AMBIGUA (perro+arroz) y
    # el léxico se abstendría, con lo que ganaría la fuente y no habría conflicto que registrar.
    # El conflicto exige que cada señal resuelva LIMPIO a una hoja distinta.
    producto = ClassifiableProduct(
        ref_id="sp-1", is_canonical=False,
        name="Croquetas Cordero Y Arroz Purina One 8 Lb",
        brand="", size_text="8 Lb",
        source_category="Supermercado > Mascotas > Perros > Alimento para perros",
    )
    result = uc.execute(producto, "DO")

    assert result.taxonomy_node_id is None, "sigue sin clasificar — la regla sagrada no se toca"
    assert cls.saved == [], "no se inventa una hoja para poder guardar"

    assert len(dec.recorded) == 1
    d = dec.recorded[0]
    assert d.method == "conflict"
    assert d.taxonomy_node_id is None
    # LA evidencia que hoy se pierde: qué propuso CADA señal.
    assert d.source_leaf_id == "n-mascotas"
    assert d.name_leaf_id == "n-arroz"


def test_a_classified_product_also_records_its_decision() -> None:
    # No sólo se registran los fracasos: sin los aciertos no hay denominador, y toda tasa de
    # precisión que se calcule después estaría midiendo sólo la mitad del corpus.
    cls, dec = _FakeClassifications(), _FakeDecisions()
    uc = ClassifyStoreProduct(
        cls, _FakeCandidates(), _FakeEmbedder(), _FakeJudge(),
        {"arroz": "n-arroz"}, decisions=dec,
    )

    uc.execute(_PRODUCT, "DO")

    assert len(dec.recorded) == 1
    assert dec.recorded[0].method == "lexicon"
    assert dec.recorded[0].taxonomy_node_id == "n-arroz"


def test_the_recorder_is_optional_and_changes_no_decision() -> None:
    # Ship-safe: sin recorder la cascada se comporta exactamente igual que antes.
    cls = _FakeClassifications()
    uc = ClassifyStoreProduct(
        cls, _FakeCandidates(), _FakeEmbedder(), _FakeJudge(), {"arroz": "n-arroz"}
    )

    result = uc.execute(_PRODUCT, "DO")

    assert result.taxonomy_node_id == "n-arroz"
    assert len(cls.saved) == 1


# ------------------- el juez ARBITRA el conflicto de señales en vez de abstenerse --
#
# Medido: el conflicto origen-vs-nombre es el 62% de las abstenciones (33 de 63 en la corrida de
# 2026-08-01). Y en los casos revisados la culpa suele ser de un INGREDIENTE en el nombre:
#
#   `Acondicionador Aceite De Coco Garnier`  origen: Cuidado Capilar ✅  nombre: Aceite & Vinagre ❌
#   `Galleta Arroz Ricecrisps`               origen: Galletas ✅         nombre: Arroz, Granos ❌
#
# Degradar esos tokens NO es opción: `aceite` concentra 0.84 sobre 120 productos y nombra de verdad
# la clase del aceite de cocina; sacarlo rompería 120 clasificaciones buenas.
#
# Y la fuente TAMPOCO gana siempre — `Vinagre De Arroz Okayama` tiene origen «Salsas» y nombre
# «Aceite & Vinagre», y ahí acierta el NOMBRE. Por eso no se puede resolver con una regla fija.
#
# Es exactamente el trabajo de un juez: elegir entre DOS categorías que ya propuso una señal. No
# inventa nada — arbitra entre candidatos existentes. Sin juez, o si no alcanza el piso de
# confianza, se abstiene como antes.


_LEAF_NAMES = {"n-capilar": "Cuidado Capilar", "n-aceite": "Aceite & Vinagre"}


def test_the_judge_arbitrates_a_source_vs_name_conflict() -> None:
    cls = _FakeClassifications()
    lexicon = build_lexicon_index([
        ("n-capilar", "Cuidado Capilar"),
        ("n-aceite", "Aceite & Vinagre"),
    ])
    judge = _FakeJudge(CategoryVerdict(decision="match", confidence=0.9, cited_fields=[]))
    uc = _make(cls, _FakeCandidates(), _FakeEmbedder(), judge, lexicon=lexicon,
               leaf_names=_LEAF_NAMES)

    result = uc.execute(
        _product(
            name="Acondicionador Aceite De Coco Garnier 12.5 Onz",
            source_category="Salud y Belleza > Cuidado Capilar > Acondicionador",
        ),
        "DO",
    )

    assert judge.called is True, "el conflicto es justo lo que un juez sabe resolver"
    assert result.taxonomy_node_id is not None
    assert result.method == "llm"


def test_a_conflict_without_a_judge_still_abstains() -> None:
    # Sin juez la conducta es la de siempre: dos señales fuertes en desacuerdo → decide el humano.
    cls = _FakeClassifications()
    lexicon = build_lexicon_index([
        ("n-capilar", "Cuidado Capilar"),
        ("n-aceite", "Aceite & Vinagre"),
    ])
    uc = _make(cls, _FakeCandidates(), _FakeEmbedder(), None, lexicon=lexicon,
               leaf_names=_LEAF_NAMES)

    result = uc.execute(
        _product(
            name="Acondicionador Aceite De Coco Garnier",
            source_category="Salud y Belleza > Cuidado Capilar > Acondicionador",
        ),
        "DO",
    )

    assert result.method == "conflict"
    assert cls.saved == []


def test_an_unsure_judge_leaves_the_conflict_to_the_human() -> None:
    # El piso de confianza rige igual que en la banda gris: un veredicto flojo NO asigna categoría.
    cls = _FakeClassifications()
    lexicon = build_lexicon_index([
        ("n-capilar", "Cuidado Capilar"),
        ("n-aceite", "Aceite & Vinagre"),
    ])
    judge = _FakeJudge(CategoryVerdict(decision="uncertain", confidence=0.0, cited_fields=[]))
    uc = _make(cls, _FakeCandidates(), _FakeEmbedder(), judge, lexicon=lexicon,
               leaf_names=_LEAF_NAMES)

    result = uc.execute(
        _product(
            name="Acondicionador Aceite De Coco Garnier",
            source_category="Salud y Belleza > Cuidado Capilar > Acondicionador",
        ),
        "DO",
    )

    assert result.taxonomy_node_id is None
    assert cls.saved == []


# --- El juez recorre TODOS los candidatos del vector, no sólo el top-1 -----------------------
# Medido 2026-08-01 sobre la cola real: en banda gris los candidatos vienen apiñados en coseno
# ~0.47–0.49 con márgenes de milésimas, así que el orden entre ellos es casi ruido. Preguntarle al
# juez SÓLO por `vector[0]` desperdiciaba la etapa: si la hoja correcta salía #2, el juez decía «no»
# al #1 y el producto caía a «sin señal suficiente» sin que nadie le preguntara por la buena.


class _FakeJudgeByName:
    """Juez que sólo acepta la hoja cuyo nombre se le indica — para verificar QUÉ se le pregunta."""

    def __init__(self, accepts: str, confidence: float = 0.95) -> None:
        self._accepts = accepts
        self.confidence = confidence
        self.asked: list[str] = []

    def judge(self, product, candidate_name):  # type: ignore[no-untyped-def]
        self.asked.append(candidate_name)
        if candidate_name == self._accepts:
            return CategoryVerdict(decision="match", confidence=self.confidence)
        return CategoryVerdict(decision="no_match", confidence=0.0)


def test_the_judge_is_asked_about_every_grey_candidate_until_one_matches() -> None:
    cls = _FakeClassifications()
    # Margen fino (0.50−0.49) → banda gris. La hoja correcta es la SEGUNDA.
    cand = _FakeCandidates(vector=[
        _cand("n1", 0.50, "vector", name="Bebidas De Almendra"),
        _cand("n2", 0.49, "vector", name="Untables & Mermeladas"),
        _cand("n3", 0.48, "vector", name="Repostería"),
    ])
    jdg = _FakeJudgeByName(accepts="Untables & Mermeladas")
    uc = _make(cls, cand, _FakeEmbedder(), jdg)

    result = uc.execute(_PRODUCT, "DO")

    assert jdg.asked == ["Bebidas De Almendra", "Untables & Mermeladas"], (
        "pregunta en orden de score y PARA al primer match — no interroga de más"
    )
    assert result.taxonomy_node_id == "n2"
    assert result.method == "llm"
    assert cls.saved and cls.saved[0].taxonomy_node_id == "n2"


def test_all_grey_candidates_rejected_stays_unclassified() -> None:
    # La regla sagrada intacta: si el juez rechaza TODOS, no se inventa categoría.
    cls = _FakeClassifications()
    cand = _FakeCandidates(vector=[
        _cand("n1", 0.50, "vector", name="Bebidas De Almendra"),
        _cand("n2", 0.49, "vector", name="Repostería"),
    ])
    jdg = _FakeJudgeByName(accepts="Ninguna De Estas")
    uc = _make(cls, cand, _FakeEmbedder(), jdg)

    result = uc.execute(_PRODUCT, "DO")

    assert jdg.asked == ["Bebidas De Almendra", "Repostería"]
    assert result.taxonomy_node_id is None
    assert result.method == "none"
    assert cls.saved == []


def test_a_grey_candidate_below_the_confidence_floor_is_not_accepted() -> None:
    # El piso de confianza rige por candidato: un «match» flojo no clasifica, y se sigue preguntando.
    cls = _FakeClassifications()
    cand = _FakeCandidates(vector=[
        _cand("n1", 0.50, "vector", name="Bebidas De Almendra"),
        _cand("n2", 0.49, "vector", name="Untables & Mermeladas"),
    ])
    jdg = _FakeJudgeByName(accepts="Bebidas De Almendra", confidence=0.10)
    uc = _make(cls, cand, _FakeEmbedder(), jdg)

    result = uc.execute(_PRODUCT, "DO")

    assert jdg.asked == ["Bebidas De Almendra", "Untables & Mermeladas"], (
        "un match por debajo del piso no corta el recorrido"
    )
    assert result.taxonomy_node_id is None


# --- Gate de DEPARTAMENTO: la categoría de origen que nombra un área acota el vector ------------
#
# Medido 2026-08-02 sobre los productos de Bravo con categoría de origen legible: el **31% (213 de
# 698)** trae un nombre que NO corresponde a ninguna hoja pero SÍ a un departamento —«Lácteos» →
# «Lácteos & Huevos», «Frutas y vegetales» → «Frutas & Verduras», «Bebés», «Carnes»—. Esa señal se
# descartaba entera: el léxico sólo conoce hojas, así que el path no resolvía y el vector buscaba
# entre las 133 hojas del árbol.
#
# El departamento NO puede elegir hoja (sería inventar, regla sagrada). Sí puede ACOTAR el universo
# del vector a las hojas de su área. Medido sobre 9 productos reales: la hoja correcta cae en el
# top-3 acotado en 7 (`HUGGIES`→Pañales #1, `CEBOLLA`→Vegetales Frescos #2, `SALCHICHA PAVO`→
# Salchichas #2), y como el juez recorre TODOS los candidatos, los alcanza.


def _dept_case(judge=None):  # type: ignore[no-untyped-def]
    """Vector con candidatos de DOS departamentos; el origen nombra uno."""
    cand = _FakeCandidates(vector=[
        _cand("n-ron", 0.50, "vector", name="Ron"),
        _cand("n-vegetales", 0.49, "vector", name="Vegetales Frescos"),
        _cand("n-jamon", 0.48, "vector", name="Jamón"),
    ])
    uc = ClassifyStoreProduct(
        _FakeClassifications(), cand, _FakeEmbedder(), judge, {},
        parent_lexicon={"vegetale": "r-fyv", "fruta": "r-fyv"},
        leaf_to_parent={"n-vegetales": "r-fyv", "n-ron": "r-licores", "n-jamon": "r-carnes"},
    )
    return cand, uc


def test_the_department_from_the_source_narrows_the_vector_candidates() -> None:
    # Con el gate, el único candidato del departamento queda solo → margen pleno → auto_link.
    # Sin él, `Ron` ganaba por ser top-1 global de un vector que no discrimina.
    _, uc = _dept_case()
    product = ClassifiableProduct(
        ref_id="sp-1", is_canonical=False, name="RABANO ROJO LB",
        source_category="Frutas y vegetales > FV > FV-005",
    )

    result = uc.decide(product, "DO")

    assert result.taxonomy_node_id == "n-vegetales", "el departamento descartó Ron y Jamón"


def test_a_source_that_names_no_department_leaves_the_vector_untouched() -> None:
    _, uc = _dept_case()
    product = ClassifiableProduct(
        ref_id="sp-2", is_canonical=False, name="X", source_category="PC > PC-055",
    )

    result = uc.decide(product, "DO")

    # Sin departamento reconocido, la cascada se comporta EXACTAMENTE como antes: margen fino
    # (0.50−0.49) entre los tres candidatos globales → banda gris, y sin juez no clasifica.
    assert result.taxonomy_node_id is None and result.band == "grey"


def test_a_department_with_no_matching_candidate_does_not_erase_the_vector() -> None:
    """Si el filtro dejara CERO candidatos, aplicarlo convertiría una señal útil en una abstención.
    Ante eso se ignora el gate y se sigue con el vector completo: el departamento es una AYUDA,
    nunca puede empeorar el resultado respecto de no tenerlo."""
    cand = _FakeCandidates(vector=[_cand("n-ron", 0.90, "vector", name="Ron")])
    uc = ClassifyStoreProduct(
        _FakeClassifications(), cand, _FakeEmbedder(), None, {},
        parent_lexicon={"vegetale": "r-fyv"},
        leaf_to_parent={"n-ron": "r-licores"},
    )
    product = ClassifiableProduct(
        ref_id="sp-3", is_canonical=False, name="X", source_category="Vegetales",
    )

    result = uc.decide(product, "DO")

    assert result.taxonomy_node_id == "n-ron"
