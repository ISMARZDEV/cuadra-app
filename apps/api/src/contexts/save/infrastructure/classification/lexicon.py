"""Etapa léxica determinista de la cascada de clasificación (save-category-classification, Batch 3).

Diccionario keyword→hoja derivado de los NOMBRES de subcategoría (auto, sin tabla). Alta precisión:
- Tokeniza cada nombre de subcategoría con `slugify` (normaliza acentos/caja) → tokens ≥3 chars,
  sin stopwords.
- Un token que mapea a >1 hoja es AMBIGUO → se descarta del índice (nunca asigna a ciegas).
- `lexicon_match` asigna solo si el nombre del producto pega tokens de UNA sola hoja; si no, `None`
  (deja que las etapas trgm/vector/juez decidan).

PURO: sin DB ni I/O. `build_lexicon_index` recibe las hojas ya cargadas (composición).
"""
from __future__ import annotations

from dataclasses import dataclass

from ...domain.taxonomy import slugify

LexiconIndex = dict[str, str]  # token -> taxonomy_node_id (hoja)

LEXICON_CONFIDENCE = 0.95  # match determinista de keyword = confianza alta (banda auto)

_MIN_TOKEN_LEN = 3
_STOPWORDS = frozenset({
    "los", "las", "del", "con", "por", "sin", "una", "uno", "que", "para", "the", "and",
})


def _tokens(text: str) -> list[str]:
    return [
        t for t in slugify(text).split("-")
        if len(t) >= _MIN_TOKEN_LEN and t not in _STOPWORDS
    ]


def build_lexicon_index(leaves: list[tuple[str, str]]) -> LexiconIndex:
    """(node_id, subcategoría) → índice token→node_id, descartando tokens ambiguos."""
    token_to_nodes: dict[str, set[str]] = {}
    for node_id, name in leaves:
        for token in _tokens(name):
            token_to_nodes.setdefault(token, set()).add(node_id)
    return {token: next(iter(nodes)) for token, nodes in token_to_nodes.items() if len(nodes) == 1}


def lexicon_match(name: str, index: LexiconIndex) -> tuple[str, float] | None:
    """Nombre del producto → (leaf_node_id, confianza) si pega tokens de UNA sola hoja; si no None."""
    hits = {index[token] for token in _tokens(name) if token in index}
    if len(hits) == 1:
        return next(iter(hits)), LEXICON_CONFIDENCE
    return None


def lexicon_match_path(source_category: str, index: LexiconIndex) -> tuple[str, float] | None:
    """Categoría de ORIGEN (path jerárquico "A > B > C") → hoja. Matchear el string entero mezcla
    tokens de varios niveles y crea ambigüedad falsa; se matchea segmento a segmento, del más
    específico (hondo) al general, tomando el primer hit inequívoco. Compartido por el clasificador
    (`ClassifyStoreProduct`) y el matcher (category gate/boost, Etapa C)."""
    if not source_category:
        return None
    for segment in reversed(source_category.split(" > ")):
        hit = lexicon_match(segment, index)
        if hit is not None:
            return hit
    return None


@dataclass(frozen=True, slots=True)
class CategorySuggestion:
    """Una hoja propuesta al operador, CON la evidencia que la sostiene (US-CP-D2c).

    `matched_tokens` no es decorativo: es la "señal de origen" que el SDD exige para que la
    sugerencia sea una decisión informada y no una caja negra.
    """

    taxonomy_node_id: str
    matched_tokens: list[str]
    signal: str = "lexicon"

    @property
    def strength(self) -> int:
        """Cuántos tokens distintos del índice apuntan a esta hoja."""
        return len(self.matched_tokens)


def lexicon_suggestions(
    name: str,
    index: LexiconIndex,
    *,
    brand: str | None = None,
    limit: int = 5,
) -> list[CategorySuggestion]:
    """Hojas candidatas rankeadas para que elija un HUMANO (US-CP-D2c).

    Distinto de `lexicon_match` a propósito: aquél DECIDE (una hoja o `None` si hay ambigüedad);
    éste EXPONE la evidencia para que decida una persona. Por eso varias hojas pueden convivir en
    el resultado — lo que allá es ambigüedad, acá es justamente la lista de opciones.

    Sin tokens que peguen devuelve `[]`: la regla sagrada del clasificador es no inventar categoría,
    y el árbol completo queda como fallback. Los tokens ambiguos ya vienen descartados del índice.
    """
    seen: dict[str, list[str]] = {}
    # `dict.fromkeys` deduplica preservando el orden: repetir un token no puede inflar el ranking.
    for token in dict.fromkeys(_tokens(f"{name} {brand or ''}")):
        node_id = index.get(token)
        if node_id is not None:
            seen.setdefault(node_id, []).append(token)

    suggestions = [
        CategorySuggestion(taxonomy_node_id=node_id, matched_tokens=tokens)
        for node_id, tokens in seen.items()
    ]
    # Más tokens = más evidencia. Empate → orden estable por id para que la lista no baile.
    suggestions.sort(key=lambda s: (-s.strength, s.taxonomy_node_id))
    return suggestions[:limit]
