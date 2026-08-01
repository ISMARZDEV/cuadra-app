"""save: `taxonomy_node_market` — el árbol es GLOBAL, el reconocimiento es POR MERCADO (Fase 2b)

`taxonomy_node` mezclaba tres cosas con ciclos de vida distintos: el CONCEPTO (arroz y legumbres),
la ETIQUETA (texto en es-DO) y el RECONOCIMIENTO (`classification_terms` + `embedding`). Con
`market_id` en la propia fila, sembrar un 2º país producía un ÁRBOL PARALELO con ids distintos para
los mismos conceptos — sin forma de comparar precios por categoría entre países.

Después de esta migración:

  taxonomy_node        (id, parent_id, key, name, level)              ← concepto, GLOBAL
  taxonomy_node_market (node_id, market_id, terms, embedding, active) ← reconocimiento, POR MERCADO

Por qué el reconocimiento NO se comparte: los términos son del idioma Y del país. Un producto
brasileño dice "Arroz Branco Tipo 1" y los términos en español no lo pegan; y `víveres` en RD son
las raíces (yuca, plátano) mientras en otros países hispanohablantes significa "abarrotes" en
general. Mismo idioma, distinto significado → el corte es por MERCADO, no por idioma.

`active` existe porque no todo mercado lleva toda categoría: `alcohol.mamajuana` es dominicana y un
súper en Texas tiene pasillos que RD no tiene. El árbol de conceptos es la UNIÓN de todos los
mercados y `active` dice cuáles usa cada uno.

Las ETIQUETAS localizadas NO viven acá: se resuelven en el cliente contra la `key` (Fase 2a,
`apps/web/src/i18n/categories.ts`). `taxonomy_node.name` queda como etiqueta por defecto (es-DO) y
fallback cuando el bundle no tiene la key.

Ver docs/research/save-fable/taxonomia-multi-idioma.md.

Revision ID: b8e2470af1d9
Revises: a3f8d1c05e72
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import UUID

revision = "b8e2470af1d9"
down_revision = "a3f8d1c05e72"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "taxonomy_node_market",
        sa.Column(
            "node_id",
            UUID(as_uuid=True),
            sa.ForeignKey("save.taxonomy_node.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("market_id", sa.Text(), primary_key=True),
        sa.Column("classification_terms", sa.Text()),
        sa.Column("embedding", Vector(1024)),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        schema="save",
    )

    # Un nodo por mercado, copiando su reconocimiento tal cual. `active=true`: todo lo que existe
    # hoy está en uso — apagar categorías es una decisión posterior del operador, no de la migración.
    op.execute(
        """
        INSERT INTO save.taxonomy_node_market
               (node_id, market_id, classification_terms, embedding, active)
        SELECT id, market_id, classification_terms, embedding, true
          FROM save.taxonomy_node
        """
    )

    # La key pasa a ser única GLOBALMENTE (un concepto = una fila). Con más de un mercado sembrado
    # las keys colisionarían y habría que fusionar los árboles a mano ANTES de correr esto; se
    # aborta con un mensaje claro en vez de reventar con un error de constraint ilegible.
    op.execute(
        """
        DO $$
        DECLARE dupes int;
        BEGIN
          SELECT count(*) INTO dupes FROM (
            SELECT key FROM save.taxonomy_node WHERE key IS NOT NULL
             GROUP BY key HAVING count(*) > 1
          ) x;
          IF dupes > 0 THEN
            RAISE EXCEPTION 'Hay % keys repetidas entre mercados. Fusioná los árboles antes de migrar.', dupes;
          END IF;
        END $$;
        """
    )

    op.drop_constraint("uq_taxonomy_market_key", "taxonomy_node", schema="save", type_="unique")
    op.drop_constraint(
        "uq_taxonomy_market_parent_name", "taxonomy_node", schema="save", type_="unique"
    )
    op.create_unique_constraint("uq_taxonomy_key", "taxonomy_node", ["key"], schema="save")
    op.create_unique_constraint(
        "uq_taxonomy_parent_name", "taxonomy_node", ["parent_id", "name"], schema="save"
    )

    op.drop_column("taxonomy_node", "embedding", schema="save")
    op.drop_column("taxonomy_node", "classification_terms", schema="save")
    op.drop_column("taxonomy_node", "market_id", schema="save")


def downgrade() -> None:
    op.add_column("taxonomy_node", sa.Column("market_id", sa.Text()), schema="save")
    op.add_column(
        "taxonomy_node", sa.Column("classification_terms", sa.Text()), schema="save"
    )
    op.add_column("taxonomy_node", sa.Column("embedding", Vector(1024)), schema="save")
    # Se recupera el mercado con MENOR market_id: con varios sembrados la vuelta atrás es LOSSY
    # (el modelo viejo no puede representar un concepto compartido).
    op.execute(
        """
        UPDATE save.taxonomy_node n
           SET market_id = m.market_id,
               classification_terms = m.classification_terms,
               embedding = m.embedding
          FROM (
            SELECT DISTINCT ON (node_id) node_id, market_id, classification_terms, embedding
              FROM save.taxonomy_node_market ORDER BY node_id, market_id
          ) m
         WHERE n.id = m.node_id
        """
    )
    op.execute("UPDATE save.taxonomy_node SET market_id = 'DO' WHERE market_id IS NULL")
    op.alter_column("taxonomy_node", "market_id", nullable=False, schema="save")

    op.drop_constraint("uq_taxonomy_key", "taxonomy_node", schema="save", type_="unique")
    op.drop_constraint("uq_taxonomy_parent_name", "taxonomy_node", schema="save", type_="unique")
    op.create_unique_constraint(
        "uq_taxonomy_market_key", "taxonomy_node", ["market_id", "key"], schema="save"
    )
    op.create_unique_constraint(
        "uq_taxonomy_market_parent_name",
        "taxonomy_node",
        ["market_id", "parent_id", "name"],
        schema="save",
    )
    op.drop_table("taxonomy_node_market", schema="save")
