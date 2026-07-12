"""Selección del mejor candidato para un canónico OBJETIVO (Loop B cobertura dirigida), PURO (ADR 31).

Fix del hallazgo live 2026-07-12: Loop B ingestaba TODOS los ~65 resultados de la búsqueda dirigida y
matcheaba cada uno contra CUALQUIER canónico → el objetivo se cubría por casualidad (1/23). Ahora,
sabiendo el canónico que se quiere cubrir, se elige el ÚNICO mejor candidato PARA ese objetivo y solo
ESE pasa a la cascada (que decide el enlace real, auto-link determinista si es fuerte — SIN LLM).

La selección es una HEURÍSTICA barata (EAN exacto → o similitud trigram del nombre); la decisión
autoritativa la sigue tomando la cascada de matching (EAN→trgm→vector→boosts→gates→banding). Por eso
un trigram simple en Python alcanza: solo ELIGE cuál candidato validar, no decide el merge.
"""
from __future__ import annotations

from typing import Protocol, TypeVar

# Piso de similitud para NO ingestar puro ruido (guandules→azúcar). La cascada rechazaría igual, pero
# un piso evita materializar/matchear un candidato sin relación con el objetivo.
_MIN_SIMILARITY = 0.3


def _trigrams(text: str) -> set[str]:
    """Trigramas del texto (aproxima pg_trgm: minúsculas + padding de bordes)."""
    norm = f"  {text.strip().lower()} "
    return {norm[i : i + 3] for i in range(len(norm) - 2)}


def trigram_similarity(a: str, b: str) -> float:
    """Similitud Jaccard sobre trigramas (0..1). Aproxima `similarity()` de pg_trgm para ORDENAR
    candidatos; no pretende ser idéntica bit-a-bit (la cascada usa el pg_trgm real para decidir)."""
    ta, tb = _trigrams(a), _trigrams(b)
    if not ta or not tb:
        return 0.0
    union = len(ta | tb)
    return len(ta & tb) / union if union else 0.0


class _Candidate(Protocol):
    name: str
    ean: str | None


C = TypeVar("C", bound=_Candidate)


def select_best_candidate(
    *,
    target_name: str,
    target_ean: str | None,
    candidates: list[C],
    min_similarity: float = _MIN_SIMILARITY,
) -> C | None:
    """El mejor candidato PARA el canónico objetivo, o None si ninguno es relevante.

    Prioridad: (1) EAN exacto del objetivo (señal más fuerte, gana sin importar el nombre);
    (2) mayor similitud trigram del nombre, siempre que supere `min_similarity`.
    """
    if target_ean:
        for cand in candidates:
            if getattr(cand, "ean", None) and cand.ean == target_ean:
                return cand
    best: C | None = None
    best_sim = 0.0
    for cand in candidates:
        sim = trigram_similarity(cand.name, target_name)
        if sim > best_sim:
            best, best_sim = cand, sim
    return best if best_sim >= min_similarity else None
