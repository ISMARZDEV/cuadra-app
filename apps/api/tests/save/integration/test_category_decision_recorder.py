"""Integration — `SqlCategoryDecisionRecorder`: la bitácora de decisiones de clasificación.

Existe porque las dos ramas de abstención de la cascada (`conflict` y `none`) no persistían NADA:
`ClassifyStoreProduct.execute` sólo escribe si hay hoja. Medido 2026-08-01: 89 de 292 productos
(31%) sin clasificar, y averiguar por qué exigió reproducir la cascada producto por producto,
volviendo a llamar al LLM.
"""
from __future__ import annotations

import uuid

from sqlalchemy import text

from src.contexts.save.domain.classification import CategoryCandidate, CategoryDecision
from src.contexts.save.infrastructure.repositories import SqlCategoryDecisionRecorder


def _store_product(db_session) -> str:  # type: ignore[no-untyped-def]
    """Un store_product mínimo — la bitácora tiene FK con CASCADE hacia él.

    SIEMBRA su propio proveedor. Antes tomaba `SELECT id FROM save.provider LIMIT 1`, o sea el
    primero que YA existiera: pasaba en una base de desarrollo con tiendas cargadas y reventaba en
    CI con `NotNullViolation` sobre `provider_id`, porque ahí la base está limpia y el SELECT
    devolvía `None`. Un test no puede depender de datos que no sembró.
    """
    provider_id = uuid.uuid4()
    db_session.execute(
        text(
            """INSERT INTO save.provider (id, name, type, platform, market_id)
               VALUES (:i, :n, 'supermarket', 'vtex', 'DO')"""
        ),
        {"i": provider_id, "n": f"Proveedor de prueba {provider_id}"},
    )
    spid = uuid.uuid4()
    db_session.execute(
        text(
            """INSERT INTO save.store_product
                   (id, provider_id, external_id, current_price_minor, currency, name)
               VALUES (:i, :p, :e, 1000, 'DOP', 'Guandules Secos La Famosa 15 Oz')"""
        ),
        {"i": spid, "p": provider_id, "e": f"ext-{spid}"},
    )
    return str(spid)


def test_an_abstention_is_recorded_with_what_each_signal_proposed(db_session) -> None:  # type: ignore[no-untyped-def]
    """El caso que motivó la tabla: dos señales fuertes en desacuerdo.

    Sin `source_leaf_id`/`name_leaf_id` un `conflict` guardado sería indistinguible de un `none`, y
    volveríamos exactamente al estado del que venimos: saber que se abstuvo, no por qué.
    """
    spid = _store_product(db_session)
    leaves = db_session.execute(
        text("SELECT id FROM save.taxonomy_node WHERE parent_id IS NOT NULL LIMIT 2")
    ).scalars().all()

    SqlCategoryDecisionRecorder(db_session).record(
        CategoryDecision(
            ref_id=spid,
            is_canonical=False,
            market_id="DO",
            method="conflict",
            taxonomy_node_id=None,
            source_leaf_id=str(leaves[0]),
            name_leaf_id=str(leaves[1]),
            matched_tokens=("Secos", "Guandules"),
        )
    )

    row = db_session.execute(
        text("SELECT * FROM save.category_decision WHERE store_product_id = :i"), {"i": spid}
    ).mappings().one()

    assert row["taxonomy_node_id"] is None, "una abstención NO se convierte en clasificación"
    assert row["method"] == "conflict"
    assert str(row["source_leaf_id"]) == str(leaves[0])
    assert str(row["name_leaf_id"]) == str(leaves[1])
    assert row["matched_tokens"] == "Secos, Guandules"


def test_an_abstention_creates_no_category_classification(db_session) -> None:  # type: ignore[no-untyped-def]
    # La regla sagrada, verificada en la DB y no sólo en el use case: registrar que la cascada dudó
    # no puede filtrarse a la tabla que el catálogo y el sitio público SÍ leen.
    spid = _store_product(db_session)

    SqlCategoryDecisionRecorder(db_session).record(
        CategoryDecision(
            ref_id=spid, is_canonical=False, market_id="DO",
            method="none", taxonomy_node_id=None,
        )
    )

    n = db_session.execute(
        text("SELECT count(*) FROM save.category_classification WHERE store_product_id = :i"),
        {"i": spid},
    ).scalar()
    assert n == 0


def test_the_vector_top_survives_so_a_grey_band_is_readable_later(db_session) -> None:  # type: ignore[no-untyped-def]
    # Sin el top-k, saber si el margen fue 0.001 o 0.029 exige volver a embeber el producto.
    spid = _store_product(db_session)

    SqlCategoryDecisionRecorder(db_session).record(
        CategoryDecision(
            ref_id=spid, is_canonical=False, market_id="DO",
            method="none", taxonomy_node_id=None, band="grey",
            vector_top=(
                CategoryCandidate("n1", 0.50, "vector", "Arroz, Granos & Legumbres"),
                CategoryCandidate("n2", 0.49, "vector", "Enlatados & Conservas"),
            ),
        )
    )

    stored = db_session.execute(
        text("SELECT vector_top FROM save.category_decision WHERE store_product_id = :i"),
        {"i": spid},
    ).scalar()
    candidatos = stored["candidates"]
    assert [c["score"] for c in candidatos] == [0.50, 0.49]
    assert candidatos[0]["name"] == "Arroz, Granos & Legumbres"


def test_a_classified_decision_keeps_its_leaf(db_session) -> None:  # type: ignore[no-untyped-def]
    # Los aciertos también se registran: sin ellos no hay denominador, y cualquier tasa de precisión
    # que se calcule después estaría midiendo sólo la mitad del corpus.
    spid = _store_product(db_session)
    leaf = db_session.execute(
        text("SELECT id FROM save.taxonomy_node WHERE parent_id IS NOT NULL LIMIT 1")
    ).scalar()

    SqlCategoryDecisionRecorder(db_session).record(
        CategoryDecision(
            ref_id=spid, is_canonical=False, market_id="DO",
            method="lexicon", taxonomy_node_id=str(leaf),
            confidence=0.95, band="auto_link",
        )
    )

    row = db_session.execute(
        text("SELECT taxonomy_node_id, method FROM save.category_decision WHERE store_product_id = :i"),
        {"i": spid},
    ).mappings().one()
    assert str(row["taxonomy_node_id"]) == str(leaf)
    assert row["method"] == "lexicon"
