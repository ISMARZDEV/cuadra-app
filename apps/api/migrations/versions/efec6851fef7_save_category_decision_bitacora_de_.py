"""save category_decision bitacora de decisiones de clasificacion

Revision ID: efec6851fef7
Revises: b8e2470af1d9
Create Date: 2026-08-01 18:51:04.434240
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'efec6851fef7'
down_revision = 'b8e2470af1d9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # NOTA: el autogenerate propuso además dropear `uq_brand_market_key` e
    # `ix_provider_market_active`. Se BORRARON de esta migración a mano: son índices por EXPRESIÓN
    # (unaccent/upper sobre el nombre de marca; parcial sobre archived_at) que Alembic no refleja
    # bien y por eso los cree ausentes del modelo. Aplicarlos habría tirado dos índices en uso.
    op.create_table('category_decision',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('store_product_id', sa.UUID(), nullable=True),
    sa.Column('canonical_product_id', sa.UUID(), nullable=True),
    sa.Column('market_id', sa.Text(), nullable=False),
    sa.Column('method', sa.Text(), nullable=False),
    sa.Column('taxonomy_node_id', sa.UUID(), nullable=True),
    sa.Column('confidence', sa.Numeric(precision=5, scale=4), nullable=False),
    sa.Column('band', sa.Text(), nullable=False),
    sa.Column('source_leaf_id', sa.UUID(), nullable=True),
    sa.Column('name_leaf_id', sa.UUID(), nullable=True),
    sa.Column('matched_tokens', sa.Text(), nullable=True),
    sa.Column('vector_top', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('(store_product_id IS NULL) <> (canonical_product_id IS NULL)', name='ck_category_decision_xor_ref'),
    sa.ForeignKeyConstraint(['canonical_product_id'], ['save.canonical_product.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['store_product_id'], ['save.store_product.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['taxonomy_node_id'], ['save.taxonomy_node.id'], ),
    sa.PrimaryKeyConstraint('id'),
    schema='save'
    )
    op.create_index('ix_category_decision_method_created', 'category_decision', ['method', 'created_at'], unique=False, schema='save')
    op.create_index('ix_category_decision_store_product', 'category_decision', ['store_product_id'], unique=False, schema='save')


def downgrade() -> None:
    op.drop_index('ix_category_decision_store_product', table_name='category_decision', schema='save')
    op.drop_index('ix_category_decision_method_created', table_name='category_decision', schema='save')
    op.drop_table('category_decision', schema='save')
    # ### end Alembic commands ###
