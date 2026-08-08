"""Integration — el seed REAL (`python -m seeds`) debe dejar la taxonomía con términos. DB.

Por qué existe este test: `CATEGORY_TERMS` vivió sin NINGÚN llamador. `seeds/__main__.py` corría
`seed_identity` + `seed_save`, y ninguno sembraba los descriptores curados. En una base nueva las
134 hojas quedaban con `classification_terms` NULL, y como `EmbedCategories` SÍ está cableado a la
ingesta (`build_category_embedder`), embebía igual — con la receta pobre padre+nombre, medida en
**43% top-1 contra el 77%** de la receta descriptiva. Sin error y sin aviso: el índice se veía
completo (134/134 con embedding) y era la mitad de bueno de lo que debía.

Lo que tapó el agujero fue el CLI del LLM corrido A MANO, que no forma parte de ningún pipeline.
"""
from __future__ import annotations

from sqlalchemy import text

_LEAVES_WITHOUT_TERMS = text(
    """
    SELECT count(*) FROM save.taxonomy_node n
    JOIN save.taxonomy_node_market m ON m.node_id = n.id
    WHERE m.market_id = 'DO' AND m.active AND n.level = 1
      AND m.classification_terms IS NULL
    """
)

_ROOTS_WITHOUT_TERMS = text(
    """
    SELECT count(*) FROM save.taxonomy_node n
    JOIN save.taxonomy_node_market m ON m.node_id = n.id
    WHERE m.market_id = 'DO' AND m.active AND n.level = 0
      AND m.classification_terms IS NULL
    """
)


def test_seed_save_leaves_no_leaf_without_curated_terms(db_session) -> None:  # type: ignore[no-untyped-def]
    from seeds.save_seed import seed_save

    # El árbol NO lo crea ninguna migración, y el CI solo hace `alembic upgrade head` antes de
    # correr los tests. Sin esta primera llamada la tabla está VACÍA allí: la precondición contaba
    # 0 hojas sin términos porque no había hojas, y el test pasaba solo en máquinas donde alguien
    # había corrido `python -m seeds` a mano. Sembrar aquí lo vuelve independiente de la base.
    seed_save(db_session)

    # Punto de partida honesto: se vacían los términos para que el seed tenga que ponerlos.
    db_session.execute(
        text("UPDATE save.taxonomy_node_market SET classification_terms = NULL WHERE market_id='DO'")
    )
    db_session.flush()
    assert db_session.execute(_LEAVES_WITHOUT_TERMS).scalar_one() > 0, "precondición"

    seed_save(db_session)

    assert db_session.execute(_LEAVES_WITHOUT_TERMS).scalar_one() == 0, (
        "el seed dejó hojas sin classification_terms: `EmbedCategories` las embebería con la "
        "receta pobre padre+nombre (43% top-1 vs 77%) sin avisar."
    )


def test_seed_save_also_seeds_root_terms(db_session) -> None:  # type: ignore[no-untyped-def]
    from seeds.save_seed import seed_save

    # Mismo motivo que arriba: sin sembrar primero, en CI el árbol está vacío y la aserción final
    # («cero raíces sin términos») se cumple TRIVIALMENTE. Pasaba en verde sin comprobar nada.
    seed_save(db_session)

    db_session.execute(
        text("UPDATE save.taxonomy_node_market SET classification_terms = NULL WHERE market_id='DO'")
    )
    db_session.flush()
    assert db_session.execute(_ROOTS_WITHOUT_TERMS).scalar_one() > 0, "precondición"

    seed_save(db_session)

    assert db_session.execute(_ROOTS_WITHOUT_TERMS).scalar_one() == 0


def test_seed_save_never_creates_nodes_deeper_than_a_leaf(db_session) -> None:  # type: ignore[no-untyped-def]
    """El árbol es de DOS niveles y el markdown es su ÚNICA fuente. `_taxonomy_leaf` creaba nodos
    al vuelo desde paths del catálogo demo (`Arroz > Arroz Blanco`, `Cuidado Corporal > Protector
    Solar`) — sin key, invisibles para el clasificador (que filtra `level == 1`) y sin más efecto
    que ensuciar la navegación con ramas vacías. Dos fuentes de verdad para el mismo árbol es el
    bug, no el drift: lo dice el propio comentario del seed sobre el `_TAXONOMY` hardcodeado."""
    from seeds.save_seed import seed_save

    seed_save(db_session)

    deep = db_session.execute(
        text("SELECT count(*) FROM save.taxonomy_node WHERE level >= 2")
    ).scalar_one()
    assert deep == 0, (
        f"el seed creó {deep} nodos de nivel ≥2. El markdown solo produce nivel 0 y 1; "
        "todo lo demás es una segunda fuente de verdad, y nace sin key."
    )
