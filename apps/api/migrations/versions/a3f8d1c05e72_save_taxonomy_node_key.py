"""save: `taxonomy_node.key` — identidad estable, independiente de la etiqueta

El id del nodo se derivaba del NOMBRE en español (`uuid5("taxonomy:DO/Padre/Hoja")`), así que
renombrar una categoría creaba un nodo NUEVO y orfanaba el viejo — medido el 2026-08-01: 10
renames = 10 huérfanos que hubo que borrar a mano verificando referencias.

La `key` separa IDENTIDAD de ETIQUETA. El seed busca por (market_id, key) y actualiza el `name`,
así que un rename ya no toca la identidad. El id queda OPACO: corregir una key después es un
UPDATE de texto, sin churn de ids.

Backfill: la key de los nodos existentes se deriva UNA vez del árbol actual (slug del padre +
slug de la hoja), que es exactamente lo que quedó escrito en el markdown. Desde acá en adelante
la key se lee del markdown y NUNCA se re-deriva del nombre.

Los nodos de nivel ≥2 (hijos de la demo: Arroz > Arroz Blanco, …) no vienen del markdown y quedan
con `key` NULL — por eso la columna es nullable.

Ver docs/research/save-fable/taxonomia-multi-idioma.md.

Revision ID: a3f8d1c05e72
Revises: d7c4b2e91f58
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "a3f8d1c05e72"
down_revision = "d7c4b2e91f58"
branch_labels = None
depends_on = None

# Mismo criterio que `domain.taxonomy.slugify` y que el `slug` de la web: minúsculas, sin acentos,
# no-alfanumérico → guion, sin guiones en los bordes. Se escribe en SQL para que el backfill no
# dependa de importar código de la app dentro de la migración.
_SLUG = (
    "trim(both '-' from regexp_replace("
    "  lower(translate({col}, "
    "    'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', "
    "    'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), "
    "  '[^a-z0-9]+', '-', 'g'))"
)


def upgrade() -> None:
    op.add_column("taxonomy_node", sa.Column("key", sa.Text(), nullable=True), schema="save")

    # Nivel 0: la key es el slug del propio nombre.
    op.execute(
        f"UPDATE save.taxonomy_node SET key = {_SLUG.format(col='name')} WHERE level = 0"
    )
    # Nivel 1: "<slug del padre>.<slug propio>".
    op.execute(
        f"""
        UPDATE save.taxonomy_node c
           SET key = p.key || '.' || {_SLUG.format(col='c.name')}
          FROM save.taxonomy_node p
         WHERE c.parent_id = p.id AND c.level = 1 AND p.key IS NOT NULL
        """
    )
    op.create_unique_constraint(
        "uq_taxonomy_market_key", "taxonomy_node", ["market_id", "key"], schema="save"
    )


def downgrade() -> None:
    op.drop_constraint("uq_taxonomy_market_key", "taxonomy_node", schema="save", type_="unique")
    op.drop_column("taxonomy_node", "key", schema="save")
