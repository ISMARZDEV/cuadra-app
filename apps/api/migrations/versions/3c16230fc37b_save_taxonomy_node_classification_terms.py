"""save: taxonomy_node.classification_terms

Revision ID: 3c16230fc37b
Revises: a5b6c7d8e9f0
Create Date: 2026-07-18 14:59:33.590648

Columna curable con los descriptores del dominio de cada hoja de taxonomía (level=1) para la receta
de embedding del clasificador. Aditiva y nullable → sin backfill, sin dato existente tocado. El
autogenerate proponía dropear tablas ajenas a Alembic (checkpoints de LangGraph, spike_transaction)
e índices HNSW/trgm/freshness — se descartaron (cuadra-api §4): esta migración solo añade la columna.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = '3c16230fc37b'
down_revision = 'a5b6c7d8e9f0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'taxonomy_node',
        sa.Column('classification_terms', sa.Text(), nullable=True),
        schema='save',
    )


def downgrade() -> None:
    op.drop_column('taxonomy_node', 'classification_terms', schema='save')
