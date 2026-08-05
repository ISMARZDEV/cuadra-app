"""Integration — integridad estructural del árbol de taxonomía, impuesta por el ESQUEMA. DB.

`taxonomy_node` es un adjacency list (cada fila apunta a su padre). Ese modelo admite dos estados
que el código nunca produce pero que la base sí aceptaba, y ninguno da un error visible:

1. **Un ciclo** (`A → B → A`). `ancestors()` sube con `while current is not None`: sin un NULL
   arriba, no termina NUNCA. Un cuelgue, no una excepción.
2. **`level` desincronizado** de la cadena real de padres. Es un atributo DERIVADO —desnormalizado
   a propósito, porque el clasificador filtra `level == 1` en sus consultas calientes— pero nada
   obligaba a que fuera cierto.

El tercer hueco —dos RAÍCES homónimas, que Postgres permite porque cada NULL cuenta como distinto
en un índice único— NO se cierra acá. Se probó con `UNIQUE NULLS NOT DISTINCT` y rompió 41 tests:
el árbol es GLOBAL, así que exigir nombres únicos en la tabla impide armar fixtures aislados. Como
en producción el único que escribe raíces es `seed_taxonomy` desde el markdown, ese invariante vive
en `tests/save/unit/test_taxonomy_seed.py::test_no_two_roots_share_a_name`.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DatabaseError

_INSERT = text(
    "INSERT INTO save.taxonomy_node (id, parent_id, name, level, key) "
    "VALUES (:id, :parent, :name, :level, :key)"
)


def _new_root(db_session, name: str):  # type: ignore[no-untyped-def]
    node_id = str(uuid.uuid4())
    db_session.execute(
        _INSERT,
        {"id": node_id, "parent": None, "name": name, "level": 0, "key": f"k-{node_id[:8]}"},
    )
    db_session.flush()
    return node_id


def test_a_node_cannot_become_its_own_ancestor(db_session) -> None:  # type: ignore[no-untyped-def]
    """El ciclo cuelga `ancestors()`, que sube hasta encontrar un NULL que ya no existe."""
    root = _new_root(db_session, f"Ciclo {uuid.uuid4().hex[:6]}")
    child_id = str(uuid.uuid4())
    db_session.execute(
        _INSERT,
        {"id": child_id, "parent": root, "name": "Hija", "level": 1, "key": f"c-{child_id[:8]}"},
    )
    db_session.flush()

    with pytest.raises(DatabaseError):
        with db_session.begin_nested():
            db_session.execute(
                text("UPDATE save.taxonomy_node SET parent_id = :c WHERE id = :r"),
                {"c": child_id, "r": root},
            )
            db_session.flush()


def test_a_node_cannot_be_its_own_parent(db_session) -> None:  # type: ignore[no-untyped-def]
    root = _new_root(db_session, f"Auto {uuid.uuid4().hex[:6]}")

    with pytest.raises(DatabaseError):
        with db_session.begin_nested():
            db_session.execute(
                text("UPDATE save.taxonomy_node SET parent_id = :r WHERE id = :r"), {"r": root}
            )
            db_session.flush()


def test_level_is_derived_from_the_parent_not_trusted_from_the_caller(db_session) -> None:  # type: ignore[no-untyped-def]
    """`level` es DERIVADO: se calcula, no se cree. Un caller que lo manda mal no puede mentir."""
    root = _new_root(db_session, f"Nivel {uuid.uuid4().hex[:6]}")
    child_id = str(uuid.uuid4())
    db_session.execute(
        _INSERT,
        # se pasa 7 a propósito: el valor correcto es 1
        {"id": child_id, "parent": root, "name": "Hija", "level": 7, "key": f"n-{child_id[:8]}"},
    )
    db_session.flush()

    level = db_session.execute(
        text("SELECT level FROM save.taxonomy_node WHERE id = :i"), {"i": child_id}
    ).scalar_one()
    assert level == 1, "el nivel debe salir del padre, no del INSERT"


def test_the_real_tree_has_no_level_drift(db_session) -> None:  # type: ignore[no-untyped-def]
    """Y el árbol que está en la base cumple el invariante de punta a punta."""
    drift = db_session.execute(
        text(
            "SELECT count(*) FROM save.taxonomy_node c "
            "JOIN save.taxonomy_node p ON p.id = c.parent_id WHERE c.level <> p.level + 1"
        )
    ).scalar_one()
    assert drift == 0
    huerfanas = db_session.execute(
        text("SELECT count(*) FROM save.taxonomy_node WHERE parent_id IS NULL AND level <> 0")
    ).scalar_one()
    assert huerfanas == 0
