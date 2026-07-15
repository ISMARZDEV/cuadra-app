"""save: category_classification table + taxonomy_node.embedding

Revision ID: 4933e9cd6bcc
Revises: 0990d45c068a
Create Date: 2026-07-09 20:32:10.773632

save-category-classification (Batch 1). Agrega:
  - `save.category_classification`: registro de decisión de clasificación (A2). CHECK XOR
    (exactamente uno de store_product_id/canonical_product_id) + índices únicos PARCIALES
    `WHERE status='active'` → a lo sumo UNA clasificación activa por producto.
  - `save.taxonomy_node.embedding vector(1024)`: índice semántico de categorías (BGE-M3, mismo
    modelo que canonical_product.embedding). El índice HNSW se agrega en Batch 5 (con la query
    find_leaves_vector); aquí solo la columna (R1).

NOTA: la columna vector se crea con SQL crudo (igual que 614e370d452c), porque pgvector no se
importa en el entorno de migraciones. Autogenerate arrastraba drops espurios (checkpoints de
LangGraph, spike_transaction, índices HNSW/trgm creados por SQL crudo) — eliminados a mano.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = '4933e9cd6bcc'
down_revision = '0990d45c068a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'category_classification',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('store_product_id', sa.UUID(), nullable=True),
        sa.Column('canonical_product_id', sa.UUID(), nullable=True),
        sa.Column('taxonomy_node_id', sa.UUID(), nullable=False),
        sa.Column('confidence', sa.Numeric(precision=5, scale=4), nullable=False),
        sa.Column('method', sa.Text(), nullable=False),
        sa.Column('status', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint(
            '(store_product_id IS NULL) <> (canonical_product_id IS NULL)',
            name='ck_category_classification_xor_ref',
        ),
        sa.ForeignKeyConstraint(['canonical_product_id'], ['save.canonical_product.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['store_product_id'], ['save.store_product.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['taxonomy_node_id'], ['save.taxonomy_node.id']),
        sa.PrimaryKeyConstraint('id'),
        schema='save',
    )
    op.create_index(
        'uq_category_classification_active_store_product',
        'category_classification', ['store_product_id'], unique=True, schema='save',
        postgresql_where=sa.text("status = 'active'"),
    )
    op.create_index(
        'uq_category_classification_active_canonical',
        'category_classification', ['canonical_product_id'], unique=True, schema='save',
        postgresql_where=sa.text("status = 'active'"),
    )
    op.execute("ALTER TABLE save.taxonomy_node ADD COLUMN embedding vector(1024)")


def downgrade() -> None:
    op.execute("ALTER TABLE save.taxonomy_node DROP COLUMN IF EXISTS embedding")
    op.drop_index(
        'uq_category_classification_active_canonical',
        table_name='category_classification', schema='save',
        postgresql_where=sa.text("status = 'active'"),
    )
    op.drop_index(
        'uq_category_classification_active_store_product',
        table_name='category_classification', schema='save',
        postgresql_where=sa.text("status = 'active'"),
    )
    op.drop_table('category_classification', schema='save')
