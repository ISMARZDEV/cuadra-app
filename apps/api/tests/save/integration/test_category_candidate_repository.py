"""Integration — SqlCategoryCandidateRepository (save-category-classification, Batch 5). DB.

- find_leaves_trgm: candidatos por similitud léxica del nombre vs subcategorías (nivel 1).
- find_leaves_vector: candidatos por cercanía coseno del embedding.
Ambos filtran por market y solo hojas (level=1).
"""
from __future__ import annotations

import uuid

from seeds.save_taxonomy_seed import seed_taxonomy
from src.contexts.save.infrastructure.repositories import (
    SqlCategoryCandidateRepository,
    SqlCategoryIndexRepository,
)

_ENTRIES = [
    ("Despensa & Abarrotes", ["Arroz, Granos & Legumbres", "Aceite & Vinagre"]),
    ("Cuidado Del Hogar", ["Lavado De Ropa"]),
]


def _seed(db_session, market: str) -> None:  # type: ignore[no-untyped-def]
    seed_taxonomy(db_session, market_id=market, entries=_ENTRIES)
    db_session.flush()


def test_find_leaves_trgm_ranks_lexical_match(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    _seed(db_session, market)
    repo = SqlCategoryCandidateRepository(db_session)

    cands = repo.find_leaves_trgm("Arroz Blanco Sirena 5 Lb", market, limit=3)

    assert cands, "esperaba al menos un candidato trgm"
    # "Arroz, Granos & Legumbres" comparte trigramas con "Arroz Blanco" → primero
    top_names = _names(db_session, [c.taxonomy_node_id for c in cands])
    assert top_names[0] == "Arroz, Granos & Legumbres"
    assert all(c.source == "trgm" for c in cands)


def test_find_leaves_vector_ranks_by_cosine(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    _seed(db_session, market)
    index = SqlCategoryIndexRepository(db_session)
    # embeddings ortogonales manuales por hoja
    leaves = index.leaves_without_embedding(market, limit=50)
    target_id = None
    for i, (node_id, name, _parent) in enumerate(leaves):
        vec = [0.0] * 1024
        vec[i] = 1.0
        index.set_embedding(node_id, vec)
        if name == "Lavado De Ropa":
            target_id, target_i = node_id, i
    db_session.flush()

    query = [0.0] * 1024
    query[target_i] = 1.0  # idéntico al de "Lavado De Ropa"
    repo = SqlCategoryCandidateRepository(db_session)
    cands = repo.find_leaves_vector(query, market, limit=3)

    assert cands
    assert cands[0].taxonomy_node_id == target_id
    assert all(c.source == "vector" for c in cands)


def _names(db_session, node_ids: list[str]) -> list[str]:  # type: ignore[no-untyped-def]
    from src.contexts.save.infrastructure.models import TaxonomyNodeModel
    return [db_session.get(TaxonomyNodeModel, uuid.UUID(i)).name for i in node_ids]
