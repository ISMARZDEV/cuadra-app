"""save schema (catalogo + precio SCD-4)

Revision ID: c73bedb700cf
Revises: a3f7c1e9d8b4
Create Date: 2026-07-03 22:47:40.214181

Schema `save` (ADR 33): catálogo normalizado (brand/taxonomy en tablas propias) + precio SCD-4
(actual en store_product, histórico append-only en price). Editada a mano para NO tocar las tablas
del checkpointer de LangGraph ni `spike_transaction` (creadas fuera de Alembic — autogenerate las
quería dropear).
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'c73bedb700cf'
down_revision = 'a3f7c1e9d8b4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS save")  # ADR 33: autogenerate NO crea el schema
    op.create_table(
        'brand',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('market_id', sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('market_id', 'name', name='uq_brand_market_name'),
        schema='save',
    )
    op.create_table(
        'provider',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('type', sa.Text(), nullable=False),
        sa.Column('platform', sa.Text(), nullable=False),
        sa.Column('market_id', sa.Text(), nullable=False),
        sa.Column('base_url', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        schema='save',
    )
    op.create_table(
        'taxonomy_node',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('parent_id', sa.UUID(), nullable=True),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('level', sa.SmallInteger(), server_default='0', nullable=False),
        sa.Column('market_id', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(['parent_id'], ['save.taxonomy_node.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('market_id', 'parent_id', 'name', name='uq_taxonomy_market_parent_name'),
        schema='save',
    )
    op.create_table(
        'canonical_product',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('brand_id', sa.UUID(), nullable=True),
        sa.Column('quality', sa.Text(), nullable=True),
        sa.Column('size_amount', sa.Numeric(precision=18, scale=8), nullable=False),
        sa.Column('size_measure', sa.Text(), nullable=False),
        sa.Column('taxonomy_node_id', sa.UUID(), nullable=True),
        sa.Column('market_id', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(['brand_id'], ['save.brand.id']),
        sa.ForeignKeyConstraint(['taxonomy_node_id'], ['save.taxonomy_node.id']),
        sa.PrimaryKeyConstraint('id'),
        schema='save',
    )
    op.create_index('ix_canonical_product_market', 'canonical_product', ['market_id'], schema='save')
    op.create_table(
        'store_product',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('provider_id', sa.UUID(), nullable=False),
        sa.Column('canonical_product_id', sa.UUID(), nullable=True),
        sa.Column('external_id', sa.Text(), nullable=False),
        sa.Column('current_price_minor', sa.BigInteger(), nullable=False),
        sa.Column('currency', sa.CHAR(length=3), nullable=False),
        sa.Column('url', sa.Text(), nullable=True),
        sa.Column('ean', sa.Text(), nullable=True),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['canonical_product_id'], ['save.canonical_product.id']),
        sa.ForeignKeyConstraint(['provider_id'], ['save.provider.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('provider_id', 'external_id', name='uq_store_product_provider_external'),
        schema='save',
    )
    op.create_index('ix_store_product_canonical', 'store_product', ['canonical_product_id'], schema='save')
    op.create_table(
        'price',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('store_product_id', sa.UUID(), nullable=False),
        sa.Column('value_minor', sa.BigInteger(), nullable=False),
        sa.Column('currency', sa.CHAR(length=3), nullable=False),
        sa.Column('captured_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('price_type', sa.Text(), nullable=False),
        sa.Column('source', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(['store_product_id'], ['save.store_product.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        schema='save',
    )
    op.create_index(
        'ix_price_store_product_captured', 'price', ['store_product_id', 'captured_at'], schema='save'
    )


def downgrade() -> None:
    op.drop_table('price', schema='save')
    op.drop_table('store_product', schema='save')
    op.drop_table('canonical_product', schema='save')
    op.drop_table('taxonomy_node', schema='save')
    op.drop_table('provider', schema='save')
    op.drop_table('brand', schema='save')
    op.execute("DROP SCHEMA IF EXISTS save CASCADE")
