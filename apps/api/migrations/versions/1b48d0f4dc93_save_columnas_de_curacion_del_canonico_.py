"""save: columnas de curacion del canonico (F5 detalle)

Agrega a `save.canonical_product` las cuatro columnas que el SDD del detalle necesitaba y que el
modelo no tenía. Sin ellas, cuatro historias (D2 descripción, D4b historial de imagen, D10 notas
internas, D12 archivar) nacían bloqueadas.

Todas NULLABLE a propósito: el catálogo ya tiene filas y ninguna de estas señales se puede inventar
para lo existente.

**`archived_at` es SOFT-DELETE, no un borrado diferido.** `NULL` = activo. Un canónico archivado
conserva su slug, su histórico de precios y sus `product_match`: borrarlo físicamente dejaría
`store_product.canonical_product_id` colgando y rompería comparaciones ya publicadas. Cualquier
lectura pública debe filtrar `archived_at IS NULL`.

**Backfill de `created_at`:** `MIN(product_match.created_at)` del canónico — el primer match es lo
más cercano a "cuándo apareció" que existe en los datos. Queda NULL donde nunca hubo match (alta
manual previa o bootstrap); estampar `now()` ahí sería fechar como recién creado un producto que
puede llevar meses en el catálogo, y ese dato falso terminaría en la UI del operador.

Revision ID: 1b48d0f4dc93
Revises: 23f1d5c67366
Create Date: 2026-07-25 10:46:02.857269
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = '1b48d0f4dc93'
down_revision = '23f1d5c67366'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'canonical_product', sa.Column('description', sa.Text(), nullable=True), schema='save'
    )
    # `server_default=now()` sólo aplica a las filas NUEVAS; las existentes quedan NULL y las
    # rellena el backfill de abajo.
    op.add_column(
        'canonical_product',
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=True,
        ),
        schema='save',
    )
    op.add_column(
        'canonical_product', sa.Column('internal_note', sa.Text(), nullable=True), schema='save'
    )
    op.add_column(
        'canonical_product', sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True),
        schema='save',
    )

    # Índice parcial: el 99% de las lecturas pide sólo los activos, y un índice sobre las filas
    # archivadas (que serán pocas) no aporta nada.
    op.create_index(
        'ix_canonical_product_active',
        'canonical_product',
        ['market_id'],
        unique=False,
        schema='save',
        postgresql_where=sa.text('archived_at IS NULL'),
    )

    # Backfill: la fecha del PRIMER match del canónico.
    op.execute(
        """
        UPDATE save.canonical_product AS cp
           SET created_at = m.first_match
          FROM (
                SELECT canonical_product_id, MIN(created_at) AS first_match
                  FROM save.product_match
                 WHERE canonical_product_id IS NOT NULL
                 GROUP BY canonical_product_id
               ) AS m
         WHERE cp.id = m.canonical_product_id
        """
    )


def downgrade() -> None:
    op.drop_index('ix_canonical_product_active', table_name='canonical_product', schema='save')
    op.drop_column('canonical_product', 'archived_at', schema='save')
    op.drop_column('canonical_product', 'internal_note', schema='save')
    op.drop_column('canonical_product', 'created_at', schema='save')
    op.drop_column('canonical_product', 'description', schema='save')
