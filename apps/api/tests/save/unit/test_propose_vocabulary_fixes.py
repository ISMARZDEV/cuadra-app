"""Unit — `ProposeVocabularyFixes`: el LLM propone, el CORPUS valida. Fakes, sin DB ni LLM real.

La división de trabajo que salió de medir todo lo anterior:
  · la MEDICIÓN sabe cuál token está roto — tiene la estadística del corpus, que el LLM no ve
  · el LLM sabe qué hacer con él — tiene la semántica, que la medición no tiene
  · el CORPUS valida la propuesta: si el LLM apunta a otra raíz que la medida, se rechaza sola
  · el HUMANO aprueba

Ese tercer paso es el que hace que el modelo no pueda alucinar por encima de los datos. Sin él
esto sería exactamente lo que el proyecto tiene prohibido: dejar que un LLM escriba el vocabulario.
"""
from __future__ import annotations

from src.contexts.save.application.propose_vocabulary_fixes import (
    ProposeVocabularyFixes,
    VocabularyProposal,
)
from src.contexts.save.infrastructure.classification.token_reliability import TokenReliability


class _FakeAdvisor:
    """LLM falso. `answers` mapea token → hoja propuesta (o None = 'no sé')."""

    def __init__(self, answers: dict[str, str | None]) -> None:
        self._answers = answers
        self.asked: list[str] = []

    def suggest_leaf(self, *, token, current_leaf, candidate_leaves):  # type: ignore[no-untyped-def]
        self.asked.append(token)
        return self._answers.get(token)


# hoja → raíz
_ROOT_OF = {
    "n-detergente-bebe": "r-bebes",
    "n-detergentes": "r-hogar",
    "n-limpiadores": "r-hogar",
    "n-arroz": "r-despensa",
}
_LEAF_NAMES = {
    "n-detergente-bebe": "Detergente De Bebé",
    "n-detergentes": "Detergentes & Jabón De Lavar",
    "n-limpiadores": "Limpiadores",
    "n-arroz": "Arroz, Granos & Legumbres",
}


def _mismapped(token: str, leaf: str, corpus_root: str) -> TokenReliability:
    return TokenReliability(
        token=token, taxonomy_node_id=leaf, index_root_id=_ROOT_OF[leaf],
        corpus_root_id=corpus_root, support=40, probability=1.0, lift=10.8,
        decides=True, mismapped=True,
    )


def _make(advisor):  # type: ignore[no-untyped-def]
    return ProposeVocabularyFixes(advisor=advisor, root_of_leaf=_ROOT_OF, leaf_names=_LEAF_NAMES)


def test_a_proposal_in_the_measured_root_is_accepted() -> None:
    # El caso real: `detergente` concentra al 100% en Limpieza, pero el índice lo manda a
    # «Detergente De Bebé» porque es la única hoja que lo nombra.
    advisor = _FakeAdvisor({"detergente": "n-detergentes"})
    uc = _make(advisor)

    props = uc.execute([_mismapped("detergente", "n-detergente-bebe", "r-hogar")])

    assert props == [
        VocabularyProposal(
            token="detergente",
            current_leaf_id="n-detergente-bebe",
            proposed_leaf_id="n-detergentes",
            corpus_root_id="r-hogar",
            support=40,
        )
    ]


def test_a_proposal_outside_the_measured_root_is_REJECTED() -> None:
    """El gate. El LLM apunta a una hoja de otra raíz que la que midió el corpus → se descarta.

    Es lo que impide que el modelo escriba el vocabulario: puede proponer, no puede contradecir
    los datos. Preguntarle a un LLM si `secos` identifica «Frutos Secos» da que sí — se lee
    razonable; el corpus dice que no. Esta validación es la que hace que eso no importe.
    """
    advisor = _FakeAdvisor({"detergente": "n-arroz"})  # despensa, no hogar
    uc = _make(advisor)

    assert uc.execute([_mismapped("detergente", "n-detergente-bebe", "r-hogar")]) == []


def test_the_advisor_only_sees_leaves_of_the_measured_root() -> None:
    # No se le ofrece al modelo la oportunidad de equivocarse: los candidatos vienen filtrados a la
    # raíz que midió el corpus. Es más barato y quita una clase entera de error.
    capturado: dict = {}

    class _Spy:
        def suggest_leaf(self, *, token, current_leaf, candidate_leaves):  # type: ignore[no-untyped-def]
            capturado["candidatos"] = candidate_leaves
            return None

    _make(_Spy()).execute([_mismapped("detergente", "n-detergente-bebe", "r-hogar")])

    ofrecidas = {leaf_id for leaf_id, _name in capturado["candidatos"]}
    assert ofrecidas == {"n-detergentes", "n-limpiadores"}
    assert "n-arroz" not in ofrecidas


def test_an_abstaining_advisor_produces_no_proposal() -> None:
    # Fail-safe, igual que los dos jueces: sin respuesta útil no se inventa nada.
    assert _make(_FakeAdvisor({"detergente": None})).execute(
        [_mismapped("detergente", "n-detergente-bebe", "r-hogar")]
    ) == []


def test_proposing_the_leaf_it_already_has_is_not_a_fix() -> None:
    # Si el modelo devuelve la hoja actual no hay nada que cambiar; emitirlo como propuesta le
    # haría perder el tiempo a la persona que revisa.
    advisor = _FakeAdvisor({"detergente": "n-detergente-bebe"})
    props = _make(advisor).execute([_mismapped("detergente", "n-detergente-bebe", "r-hogar")])
    assert props == []


def test_tokens_without_a_measured_root_are_skipped() -> None:
    # Sin raíz medida no hay contra qué validar, así que no se le pregunta al modelo: preguntar
    # sin poder verificar la respuesta es exactamente el modo de fallo que este diseño evita.
    advisor = _FakeAdvisor({"algo": "n-detergentes"})
    sin_raiz = TokenReliability(
        token="algo", taxonomy_node_id="n-arroz", index_root_id="r-despensa",
        corpus_root_id=None, support=0, probability=0.0, lift=0.0, decides=True, mismapped=False,
    )

    assert _make(advisor).execute([sin_raiz]) == []
    assert advisor.asked == []
