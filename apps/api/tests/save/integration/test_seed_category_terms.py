"""Integration — seed_category_terms (bootstrap curado de classification_terms). DB.

Siembra los descriptores del dominio en las hojas por NOMBRE. Idempotente (no pisa hojas ya
sembradas / editadas). Invalida el embedding de las que toca (re-embed).
"""
from __future__ import annotations

import uuid

from seeds.category_terms_data import CATEGORY_TERMS, seed_category_terms
from seeds.save_taxonomy_seed import seed_taxonomy
from src.contexts.save.infrastructure.models import (
    TaxonomyNodeMarketModel,
    TaxonomyNodeModel,
)

_ENTRIES = [
    (("Despensa & Abarrotes", "despensa"), [("Arroz, Granos & Legumbres", "despensa.arroz"),
                                            ("Café", "despensa.cafe")]),
    (("Bebidas", "bebidas"), [("Agua", "bebidas.agua")]),
    (("Zzz Sin Términos", "zzz"), [("Hoja Inventada Sin Data", "zzz.hoja")]),  # no está en CATEGORY_TERMS
]


def _leaf(db_session, market, name):  # type: ignore[no-untyped-def]
    return db_session.execute(
        TaxonomyNodeModel.__table__.select().where(
            TaxonomyNodeMarketModel.node_id == TaxonomyNodeModel.id,
            TaxonomyNodeMarketModel.market_id == market,
            TaxonomyNodeModel.name == name,
            TaxonomyNodeModel.level == 1,
        )
    ).one()


def test_seeds_terms_by_name_and_invalidates_embedding(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    seed_taxonomy(db_session, market_id=market, entries=_ENTRIES)
    # Fase 2b: términos y embedding viven en la fila (nodo, mercado), no en el nodo.
    arroz = _leaf(db_session, market, "Arroz, Granos & Legumbres")
    db_session.get(TaxonomyNodeMarketModel, (arroz.id, market)).embedding = [0.1] * 1024
    db_session.flush()

    count = seed_category_terms(db_session, market)

    assert count == 3  # Arroz, Café, Agua (la hoja inventada no está en el data)
    arroz2 = db_session.get(TaxonomyNodeMarketModel, (arroz.id, market))
    assert arroz2.classification_terms == CATEGORY_TERMS["Arroz, Granos & Legumbres"]
    assert arroz2.embedding is None  # invalidado → re-embed
    # la hoja sin data queda intacta
    sin = _leaf(db_session, market, "Hoja Inventada Sin Data")
    assert (
        db_session.get(TaxonomyNodeMarketModel, (sin.id, market)).classification_terms is None
    )


def test_idempotent_second_run_seeds_zero(db_session) -> None:  # type: ignore[no-untyped-def]
    market = f"T{uuid.uuid4().hex[:6]}"
    seed_taxonomy(db_session, market_id=market, entries=_ENTRIES)
    seed_category_terms(db_session, market)
    assert seed_category_terms(db_session, market) == 0  # ya sembradas → no re-toca
