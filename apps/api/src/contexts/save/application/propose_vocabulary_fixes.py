"""Use case `ProposeVocabularyFixes` — el LLM propone un arreglo de vocabulario, el CORPUS lo valida.

Cierra el loop de la Etapa 5 con la división de trabajo que salió de medir todo lo anterior:

    la MEDICIÓN  sabe CUÁL token está roto   → tiene la estadística del corpus, que el LLM no ve
    el LLM       sabe QUÉ hacer con él        → tiene la semántica, que la medición no tiene
    el CORPUS    valida la propuesta          → si apunta a otra raíz que la medida, se descarta
    el HUMANO    aprueba                      → nada se aplica solo

El tercer paso es el que hace seguro el segundo. Preguntarle a un LLM si `secos` identifica
«Semillas & Frutos Secos» devuelve que sí: se lee perfectamente razonable. El corpus dice que no —
los 6 productos que lo llevan son guandules. **La estadística del corpus es exactamente lo que el
modelo no puede ver**, así que su opinión sólo vale cuando los datos la respaldan.

QUÉ se le pregunta, y por qué es una pregunta que el LLM sí sabe responder: no "¿este token es
bueno?" (eso lo decide la medición) sino "de estas hojas concretas, ¿cuál debería quedarse con el
token?". Es juicio semántico sobre un menú cerrado, no una decisión sobre datos que no tiene.

Medido 2026-08-01: `detergente` concentra al 100% en Cuidado Del Hogar sobre 40 productos, pero el
índice lo manda a «Detergente De Bebé» porque es la única hoja cuyo nombre lo contiene. No es un
token roto — es un hueco de la taxonomía, y éste es el use case que lo convierte en una propuesta
concreta y revisable.

NUNCA aplica nada: devuelve propuestas. Ver `.claude/skills/cuadra-save-vocabulary/SKILL.md`.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from ..infrastructure.classification.token_reliability import TokenReliability


@dataclass(frozen=True, slots=True)
class VocabularyProposal:
    """Un arreglo propuesto, ya validado contra el corpus. Sigue necesitando aprobación humana."""

    token: str
    current_leaf_id: str
    proposed_leaf_id: str
    corpus_root_id: str
    support: int  # cuántos productos respaldan la medición — el peso de la evidencia


class VocabularyAdvisor(Protocol):
    """Lo mínimo que el use case necesita del asesor LLM.

    Protocol estructural LOCAL (mismo criterio que `GreyBandJudge` en el matcher): es un adapter de
    un solo propósito y el dominio no tiene por qué conocerlo. Devuelve `None` cuando no sabe —
    fail-safe, igual que los dos jueces.
    """

    def suggest_leaf(
        self, *, token: str, current_leaf: str, candidate_leaves: list[tuple[str, str]]
    ) -> str | None: ...


class ProposeVocabularyFixes:
    def __init__(
        self,
        *,
        advisor: VocabularyAdvisor,
        root_of_leaf: dict[str, str],
        leaf_names: dict[str, str],
    ) -> None:
        self._advisor = advisor
        self._root_of_leaf = root_of_leaf
        self._leaf_names = leaf_names

    def execute(self, verdicts: list[TokenReliability]) -> list[VocabularyProposal]:
        propuestas = []
        for v in verdicts:
            if v.corpus_root_id is None:
                # Sin raíz medida no hay contra qué validar la respuesta. Preguntar igual sería
                # pedirle al modelo una decisión que después no podríamos verificar — justo el modo
                # de fallo que este diseño existe para evitar.
                continue

            # Al modelo se le ofrecen SÓLO las hojas de la raíz que midió el corpus. No es una
            # optimización: quita de entrada una clase entera de error posible.
            candidatas = [
                (leaf_id, self._leaf_names.get(leaf_id, ""))
                for leaf_id, root in self._root_of_leaf.items()
                if root == v.corpus_root_id and leaf_id != v.taxonomy_node_id
            ]
            if not candidatas:
                continue

            propuesta = self._advisor.suggest_leaf(
                token=v.token,
                current_leaf=self._leaf_names.get(v.taxonomy_node_id, ""),
                candidate_leaves=candidatas,
            )
            if propuesta is None or propuesta == v.taxonomy_node_id:
                continue  # el modelo no supo, o propuso lo que ya hay: no hay arreglo que revisar

            # EL GATE: la hoja propuesta tiene que caer en la raíz que midió el corpus. El modelo
            # puede proponer; no puede contradecir los datos.
            if self._root_of_leaf.get(propuesta) != v.corpus_root_id:
                continue

            propuestas.append(
                VocabularyProposal(
                    token=v.token,
                    current_leaf_id=v.taxonomy_node_id,
                    proposed_leaf_id=propuesta,
                    corpus_root_id=v.corpus_root_id,
                    support=v.support,
                )
            )
        # Más soporte = más evidencia detrás: es el orden en que conviene revisarlas.
        return sorted(propuestas, key=lambda p: -p.support)
