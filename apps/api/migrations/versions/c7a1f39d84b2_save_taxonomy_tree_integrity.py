"""save: integridad estructural del árbol de taxonomía (sin ciclos, `level` derivado)

`taxonomy_node` es un adjacency list. El modelo admitía dos estados que el código nunca produce
pero que la base sí aceptaba — y ninguno da un error visible, que es lo que los hace peligrosos:

1. **Ciclos.** Verificado poniendo `Alcohol` como hijo de `Cerveza`: la base lo aceptó y el árbol
   pasó de 17 raíces a 16. `SqlTaxonomyRepository.ancestors()` sube con `while current is not None`
   hasta encontrar el NULL de la raíz; en un ciclo ese NULL no existe y el bucle NO TERMINA. Un
   cuelgue, no una excepción — el peor modo de fallo posible.

2. **`level` desincronizado.** Es un atributo DERIVADO (la profundidad en la cadena de padres),
   desnormalizado A PROPÓSITO porque el clasificador filtra `level == 1` en sus tres consultas
   calientes y un CTE recursivo por consulta sería caro. Pero nada obligaba a que fuera cierto: un
   UPDATE que moviera un nodo dejaba la columna mintiendo, y el filtro `level == 1` es justamente
   lo que decide qué nodos son candidatos de clasificación.

El trigger CALCULA `level` en vez de confiar en el caller — un valor derivado no se cree, se deriva.
Al mover un nodo, arrastra el nivel de toda su descendencia.

Riesgo hoy: bajo, porque nadie edita `parent_id` a mano (lo escribe `seed_taxonomy` desde el
markdown, que es un árbol por construcción). Se vuelve urgente el día que el admin permita mover
categorías — y para entonces la guarda ya está puesta.

NO se toca `uq_taxonomy_parent_name`. Se probó cambiarla a `UNIQUE NULLS NOT DISTINCT` para cerrar
el tercer hueco —dos RAÍCES homónimas, que Postgres permite porque cada NULL cuenta como distinto—
y **rompió 41 tests**. El motivo no es que los tests estén mal: el árbol es GLOBAL, así que exigir
nombres únicos a nivel de tabla impide armar fixtures aislados, que es lo que hacen (nombres
realistas con keys de prueba). Y en producción el único que escribe raíces es `seed_taxonomy` desde
el markdown, así que el punto correcto para imponer ese invariante es **el markdown**, no la tabla:
vive en `tests/save/unit/test_taxonomy_seed.py::test_no_two_roots_share_a_name`, que lo caza al
escribirlo y no al insertarlo.

Revision ID: c7a1f39d84b2
Revises: 4af2354a6ff5
"""
from __future__ import annotations

from alembic import op

revision = "c7a1f39d84b2"
down_revision = "4af2354a6ff5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Un solo trigger: rechaza ciclos y deriva `level` del padre.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION save.taxonomy_node_guard() RETURNS trigger AS $$
        DECLARE
            ancestro uuid;
            saltos   int := 0;
            nivel    smallint;
        BEGIN
            IF NEW.parent_id IS NOT NULL THEN
                IF NEW.parent_id = NEW.id THEN
                    RAISE EXCEPTION 'taxonomy_node % no puede ser su propio padre', NEW.id;
                END IF;

                -- Sube por la cadena buscando al propio nodo. `saltos` es un cinturón por si ya
                -- existiera un ciclo previo: sin él, esta comprobación se colgaría igual que el
                -- `ancestors()` que viene a proteger.
                ancestro := NEW.parent_id;
                WHILE ancestro IS NOT NULL LOOP
                    IF ancestro = NEW.id THEN
                        RAISE EXCEPTION
                            'ciclo en taxonomy_node: % no puede colgar de su descendiente %',
                            NEW.id, NEW.parent_id;
                    END IF;
                    saltos := saltos + 1;
                    IF saltos > 64 THEN
                        RAISE EXCEPTION 'cadena de padres demasiado profunda desde %', NEW.id;
                    END IF;
                    SELECT parent_id INTO ancestro FROM save.taxonomy_node WHERE id = ancestro;
                END LOOP;

                SELECT level + 1 INTO nivel FROM save.taxonomy_node WHERE id = NEW.parent_id;
                NEW.level := nivel;
            ELSE
                NEW.level := 0;  -- sin padre = raíz, por definición
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        "CREATE TRIGGER taxonomy_node_guard_trg BEFORE INSERT OR UPDATE OF parent_id "
        "ON save.taxonomy_node FOR EACH ROW EXECUTE FUNCTION save.taxonomy_node_guard()"
    )

    # Mover un nodo cambia la profundidad de TODA su descendencia. El trigger de arriba sólo ve la
    # fila que se toca, así que la propagación va en uno AFTER: recalcula el subárbol de una.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION save.taxonomy_node_reparent() RETURNS trigger AS $$
        BEGIN
            WITH RECURSIVE subarbol(id, level) AS (
                SELECT NEW.id, NEW.level
                UNION ALL
                SELECT c.id, (s.level + 1)::smallint
                FROM save.taxonomy_node c JOIN subarbol s ON c.parent_id = s.id
            )
            UPDATE save.taxonomy_node n SET level = s.level
            FROM subarbol s WHERE n.id = s.id AND n.id <> NEW.id AND n.level <> s.level;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        "CREATE TRIGGER taxonomy_node_reparent_trg AFTER UPDATE OF parent_id "
        "ON save.taxonomy_node FOR EACH ROW WHEN (OLD.parent_id IS DISTINCT FROM NEW.parent_id) "
        "EXECUTE FUNCTION save.taxonomy_node_reparent()"
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS taxonomy_node_reparent_trg ON save.taxonomy_node")
    op.execute("DROP FUNCTION IF EXISTS save.taxonomy_node_reparent()")
    op.execute("DROP TRIGGER IF EXISTS taxonomy_node_guard_trg ON save.taxonomy_node")
    op.execute("DROP FUNCTION IF EXISTS save.taxonomy_node_guard()")
