"""save: store_product.source_category (categoria de origen, Etapa B)

Revision ID: 631c00a200fb
Revises: 4933e9cd6bcc
Create Date: 2026-07-11 21:45:14.568868

Categoría CRUDA de la fuente (path del adapter, ej. "Despensa > Arroz y Granos"). Segunda señal
que la cascada de clasificación cruza con el nombre (save-category-classification, Etapa B).

NOTA: el autogenerate incluyó ruido (drop de tablas de Dagster `checkpoint_*`/`spike_transaction`
y de los índices HNSW/trgm de canonical_product creados por SQL crudo). Se REMOVIÓ a mano — esta
migración toca SOLO la columna nueva.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = '631c00a200fb'
down_revision = '4933e9cd6bcc'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'store_product',
        sa.Column('source_category', sa.Text(), nullable=True),
        schema='save',
    )


def downgrade() -> None:
    op.drop_column('store_product', 'source_category', schema='save')
