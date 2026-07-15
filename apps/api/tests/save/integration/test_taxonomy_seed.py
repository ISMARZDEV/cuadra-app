"""Integration — seed de taxonomía real (save-category-classification, Batch 2). Requiere DB.

- Idempotente: correr 2× no duplica nodos.
- 15 raíces (level 0) + subcategorías (level 1) por market.
- `ListCategories.execute(market)` devuelve el árbol sembrado.
"""
from __future__ import annotations

import uuid

from sqlalchemy import func, select

from seeds.save_taxonomy_seed import seed_taxonomy
from src.contexts.save.application.categories import ListCategories
from src.contexts.save.infrastructure.models import TaxonomyNodeModel
from src.contexts.save.infrastructure.repositories import SqlTaxonomyRepository

_ENTRIES = [
    ("Despensa & Abarrotes", ["Aceite & Vinagre", "Arroz, Granos & Legumbres"]),
    ("Frutas & Verduras", ["Frutas", "Vegetales"]),
]


def _count_nodes(db_session, market: str) -> int:  # type: ignore[no-untyped-def]
    return db_session.scalar(
        select(func.count()).select_from(TaxonomyNodeModel).where(
            TaxonomyNodeModel.market_id == market
        )
    )


def test_seed_is_idempotent(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    seed_taxonomy(db_session, market_id=market, entries=_ENTRIES)
    db_session.flush()
    first = _count_nodes(db_session, market)
    seed_taxonomy(db_session, market_id=market, entries=_ENTRIES)  # 2ª corrida
    db_session.flush()
    assert _count_nodes(db_session, market) == first  # sin duplicados


def test_seed_creates_roots_and_subcategories(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    seed_taxonomy(db_session, market_id=market, entries=_ENTRIES)
    db_session.flush()
    # 2 categorías tope (level 0) + 4 subcategorías (level 1) = 6 nodos
    roots = db_session.scalars(
        select(TaxonomyNodeModel).where(
            TaxonomyNodeModel.market_id == market, TaxonomyNodeModel.level == 0
        )
    ).all()
    assert {r.name for r in roots} == {"Despensa & Abarrotes", "Frutas & Verduras"}
    assert _count_nodes(db_session, market) == 6


def test_list_categories_returns_seeded_tree(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    seed_taxonomy(db_session, market_id=market, entries=_ENTRIES)
    db_session.flush()
    tree = ListCategories(SqlTaxonomyRepository(db_session)).execute(market)
    names = {c.name for c in tree.categories}
    assert names == {"Despensa & Abarrotes", "Frutas & Verduras"}
    despensa = next(c for c in tree.categories if c.name == "Despensa & Abarrotes")
    sub_names = {s.name for s in despensa.children}
    assert "Arroz, Granos & Legumbres" in sub_names
