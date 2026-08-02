"""Unit — guardián de `seeds/save_clean.py`: `_ALL_TABLES` debe cubrir TODO el schema `save` (PURO).

Medido 2026-08-02 contra la BD de dev: el schema tenía **24** tablas y `_ALL_TABLES` listaba **17**.
Las 7 ausentes no eran inocuas, porque el wipe corre `TRUNCATE ... RESTART IDENTITY CASCADE` y eso
parte la falla en dos mitades, ambas silenciosas:

  A) BORRA DE MÁS SIN DECIRLO — la cascada las arrastra, pero el dry-run nunca las lista, así que el
     preview que el humano aprueba subestima el daño:
       · `store_product_image`      → FK a `store_product`      (4041 filas)
       · `category_decision`        → FK a `store_product`      (2564 filas)
       · `canonical_product_image`  → FK a `canonical_product`
     Un `--reset` destruía 6605 filas que jamás aparecían en pantalla. `category_decision` es la
     bitácora de clasificación: el "reset a baseline" borraba el registro de la medición.

  B) BORRA DE MENOS — sin FK hacia ninguna tabla wipeada, sobreviven al TRUNCATE:
       · `admin_audit_log`             (453 filas — sobrevivía incluso al NUKE `--all`)
       · `orchestration_global_config`
       · `orchestration_policy`        → FK a `provider`, que `--reset` CONSERVA
       · `orchestration_run_snapshot`  → FK a policy/provider
     O sea que el "baseline limpio" no era limpio y el docstring del nuke ("se vaciarían todas las
     tablas") era falso.

Parchear la lista a mano no arregla la CAUSA: la lista se escribe una vez y el schema sigue
creciendo. Este test es el guardián — falla en la próxima migración que agregue una tabla y no
toque `_ALL_TABLES`. Es PURO: compara contra `Base.metadata`, no necesita BD.
"""
from __future__ import annotations

from seeds.save_clean import _ALL_TABLES, _CURATED_TABLES, _KEEP_TABLES
from src.shared.db.base import Base

# Importar los modelos registra las tablas en `Base.metadata` (import por efecto secundario).
import src.contexts.save.infrastructure.models  # noqa: F401  # isort:skip


def _schema_tables() -> set[str]:
    return {t.name for t in Base.metadata.sorted_tables if t.schema == "save"}


def test_all_tables_covers_every_table_in_the_save_schema() -> None:
    """Ninguna tabla del schema puede quedar fuera: la que falta, o se borra sola por cascada
    sin aparecer en el preview, o sobrevive a un reset que se anuncia como total."""
    missing = _schema_tables() - set(_ALL_TABLES)
    assert not missing, (
        f"Tablas del schema `save` ausentes de _ALL_TABLES: {sorted(missing)}. "
        "Agregalas en orden FK-seguro (dependientes → padres)."
    )


def test_all_tables_has_no_ghosts() -> None:
    """Al revés: una tabla renombrada/dropeada que quede en la lista revienta el TRUNCATE."""
    ghosts = set(_ALL_TABLES) - _schema_tables()
    assert not ghosts, f"_ALL_TABLES nombra tablas inexistentes: {sorted(ghosts)}"


def test_all_tables_has_no_duplicates() -> None:
    assert len(_ALL_TABLES) == len(set(_ALL_TABLES)), "_ALL_TABLES tiene entradas repetidas"


def test_kept_and_curated_tables_are_real_tables() -> None:
    """`_KEEP_TABLES`/`_CURATED_TABLES` se restan de `_ALL_TABLES`; un nombre mal escrito ahí no
    falla ruidosamente — simplemente NO conserva lo que prometía conservar."""
    for name, group in (("_KEEP_TABLES", _KEEP_TABLES), ("_CURATED_TABLES", _CURATED_TABLES)):
        unknown = group - set(_ALL_TABLES)
        assert not unknown, f"{name} nombra tablas fuera de _ALL_TABLES: {sorted(unknown)}"


def test_kept_tables_never_reference_a_wiped_table() -> None:
    """El invariante que hace REAL a `_KEEP_TABLES`.

    `TRUNCATE ... CASCADE` no respeta intenciones: si una tabla "conservada" tiene FK hacia una que
    sí se wipea, Postgres la trunca IGUAL. Estar en `_KEEP_TABLES` no la salva — sólo la saca del
    listado, con lo cual se borra Y encima sin aparecer en el preview. Este test es la única forma
    de que `--reset` conserve de verdad lo que promete.
    """
    wiped = set(_ALL_TABLES) - _KEEP_TABLES
    by_name = {t.name: t for t in Base.metadata.sorted_tables if t.schema == "save"}
    for kept in sorted(_KEEP_TABLES):
        for fk in by_name[kept].foreign_keys:
            parent = fk.column.table
            if parent.schema != "save":
                continue
            assert parent.name not in wiped, (
                f"`{kept}` está en _KEEP_TABLES pero depende de `{parent.name}`, que SÍ se wipea: "
                "el CASCADE la vaciaría igual."
            )


def test_dependents_are_truncated_before_their_parents() -> None:
    """El orden es parte del contrato (el docstring dice "FK-seguro: dependientes → padres").
    Se verifica contra las FK declaradas en el metadata, no contra una lista escrita a mano."""
    position = {name: i for i, name in enumerate(_ALL_TABLES)}
    for table in Base.metadata.sorted_tables:
        if table.schema != "save" or table.name not in position:
            continue
        for fk in table.foreign_keys:
            parent = fk.column.table
            if parent.schema != "save" or parent.name == table.name:
                continue  # self-FK (jerarquía de taxonomía) no impone orden
            assert position[table.name] < position[parent.name], (
                f"`{table.name}` depende de `{parent.name}` pero va DESPUÉS en _ALL_TABLES"
            )
