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
