"""Fusión RRF (Reciprocal Rank Fusion) de listas de candidatos — F2.0 matching cascade. PURA.

RRF fusiona candidatos rankeados de dos etapas heterogéneas (trgm lexical + pgvector semántico)
combinando sus RANKS (posición 1-based en cada lista), NO sus scores crudos: la similitud trgm
y la distancia/similitud coseno viven en escalas distintas y no son comparables directamente
(ver design §Score fusion). Un candidato presente en ambas listas acumula el aporte de las dos,
por lo que queda por encima de un candidato presente en una sola lista.
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence

from src.contexts.save.domain.entities import MatchCandidate

DEFAULT_RRF_K = 60


def reciprocal_rank_fusion(
    *ranked_lists: Sequence[MatchCandidate],
    k: int = DEFAULT_RRF_K,
) -> list[MatchCandidate]:
    """Fusiona N listas de candidatos (cada una ya ordenada, mejor candidato primero).

    score(item) = Σ 1/(k + rank_i), sumado sobre cada lista en la que `item` aparece
    (rank_i es 1-based). Devuelve los candidatos fusionados ordenados por score descendente.
    """
    fused_scores: dict[str, float] = defaultdict(float)
    for ranked_list in ranked_lists:
        for rank, candidate in enumerate(ranked_list, start=1):
            fused_scores[candidate.canonical_product_id] += 1.0 / (k + rank)

    fused = [
        MatchCandidate(canonical_product_id=canonical_product_id, score=score)
        for canonical_product_id, score in fused_scores.items()
    ]
    fused.sort(key=lambda candidate: candidate.score, reverse=True)
    return fused
