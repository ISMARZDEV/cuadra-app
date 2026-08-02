"""Mini-eval de la BÚSQUEDA HÍBRIDA — top-1 / top-5 contra el set etiquetado (§6.6).

Pasa el set de `tests/save/fixtures/retrieval_queries.py` por `SearchProducts` y mide cuántas
consultas resuelven al canónico correcto. NO es parte del gate (`make test`): pega a la base de
dev y carga el modelo BGE-M3. Se corre a demanda:

    cd apps/api && uv run python -m evals.retrieval_eval

Corre TRES configuraciones a propósito, porque el total solo no dice de dónde viene la calidad:

  - **léxica sola** (trgm) — es además la degradación real de §6.5, cuando no hay embedder
  - **semántica sola** (pgvector/BGE-M3)
  - **híbrida** (las dos fusionadas por RRF) ← el sistema que se despacha

La ablación es la que justifica el costo: si la híbrida no le gana a las dos por separado, RRF y
el embedder no se están pagando. Vive acá y no en el scratchpad —contra lo que sugería el
Apéndice C.1— porque una medición que no se puede repetir es un número que no se puede defender.

⚠️ Leer la advertencia del set (`retrieval_queries.py`) antes de creerle al porcentaje: el
catálogo de dev es monotemático (70% arroz, 0 café, 0 carnes) y eso lo distorsiona.
"""
from __future__ import annotations

import sys
from pathlib import Path

from src.contexts.save.application.search import SearchProducts
from src.contexts.save.infrastructure.matching.embeddings import (
    SentenceTransformersEmbeddingProvider,
)
from src.contexts.save.infrastructure.repositories import SqlCanonicalProductRepository
from src.shared.db.base import SessionLocal

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))
from save.fixtures.retrieval_queries import RETRIEVAL_QUERIES  # noqa: E402

TOP1_TARGET = 0.80
TOP5_TARGET = 0.95


class _LexicalOnly:
    """Silencia la etapa semántica — reproduce la degradación de §6.5."""

    def __init__(self, repo) -> None:  # type: ignore[no-untyped-def]
        self._repo = repo

    def __getattr__(self, name: str):  # type: ignore[no-untyped-def]
        return getattr(self._repo, name)

    def search_semantic(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        return []


class _SemanticOnly:
    def __init__(self, repo) -> None:  # type: ignore[no-untyped-def]
        self._repo = repo

    def __getattr__(self, name: str):  # type: ignore[no-untyped-def]
        return getattr(self._repo, name)

    def search_lexical(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        return []


def _run(label: str, repo, embedder) -> tuple[float, float]:  # type: ignore[no-untyped-def]
    search = SearchProducts(repo, embedding_provider=embedder, limit=5)
    top1 = top5 = 0
    misses: list[tuple[str, str, list[str]]] = []
    by_mode: dict[str, list[int]] = {}

    for lq in RETRIEVAL_QUERIES:
        names = [r.name for r in search.execute(lq.query, "DO")]
        hit1 = bool(names) and names[0] in lq.expected
        hit5 = any(n in lq.expected for n in names)
        top1 += hit1
        top5 += hit5
        stats = by_mode.setdefault(lq.mode, [0, 0, 0])
        stats[0] += 1
        stats[1] += hit1
        stats[2] += hit5
        if not hit5:
            misses.append((lq.query, lq.mode, names[:3]))

    n = len(RETRIEVAL_QUERIES)
    print(f"\n=== {label} ===  N={n}")
    print(f"  top-1: {top1}/{n} = {100 * top1 / n:.1f}%   (objetivo ≥{TOP1_TARGET:.0%})")
    print(f"  top-5: {top5}/{n} = {100 * top5 / n:.1f}%   (objetivo ≥{TOP5_TARGET:.0%})")
    for mode, (total, h1, h5) in sorted(by_mode.items()):
        print(f"    {mode:<18} top1 {h1}/{total}   top5 {h5}/{total}")
    for query, mode, got in misses:
        print(f"    ✗ [{mode}] {query!r} -> {got}")
    return top1 / n, top5 / n


def main() -> None:
    with SessionLocal() as session:
        repo = SqlCanonicalProductRepository(session)
        embedder = SentenceTransformersEmbeddingProvider()
        _run("LÉXICA sola (trgm) — la degradación de §6.5", _LexicalOnly(repo), None)
        _run("SEMÁNTICA sola (pgvector/BGE-M3)", _SemanticOnly(repo), embedder)
        top1, top5 = _run("HÍBRIDA (trgm + pgvector + RRF)", repo, embedder)

    print(
        f"\nVeredicto: top-1 {'OK' if top1 >= TOP1_TARGET else 'NO LLEGA'} · "
        f"top-5 {'OK' if top5 >= TOP5_TARGET else 'NO LLEGA'}"
    )


if __name__ == "__main__":
    main()
