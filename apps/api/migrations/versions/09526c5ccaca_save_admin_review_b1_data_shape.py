"""save admin review b1 data shape

Revision ID: 09526c5ccaca
Revises: 614e370d452c
Create Date: 2026-07-05 20:18:55.990111

F2 · B1 — data-shape de la consola admin (OFV, módulo de revisión de matching). Ver el plan
`docs/sdd/save-admin-review/plan.md` (Fase 1, tareas 1.1-1.6). Todo aditivo/nullable y reversible;
no toca la cascada F2.0 (ship-dark). Todo en schema `save`; sin FKs cruzando schemas (ADR 33).

Agrega:
  - `store_product` + name/brand/size_text/image_url: atributos crudos que hoy la ingesta descarta
    tras el matching y que el revisor necesita ver (se poblarán en write-time en 1.10).
  - `product_match` + reason_code/reason_note + judge_input_tokens/judge_output_tokens/judge_model:
    motivo de rechazo (active-learning) y costo del juez por fila (observabilidad, percentiles).
  - `review_candidate`: snapshot de los top-N candidatos por fila pending_review (lo que compara el
    humano). Cap top-5 en código, no en la DB. CASCADE al borrar el product_match.
  - `provider` + logo_url: logo del súper (MVP = pegar URL; sin storage de archivos).
  - `store_registry`: config de fuente de extracción por proveedor (1:1 en B1) — platform/base_url/
    endpoints/headers/auth + salud/pausa. Reemplaza config hardcodeada.
  - `basket_query`: la canasta curada como DATO (reemplaza `BASKET_QUERIES` en código; backfill en 3.15).
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '09526c5ccaca'
down_revision = '614e370d452c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1.1 — atributos crudos del store_product para el revisor (nullable, no backfill).
    op.add_column('store_product', sa.Column('name', sa.Text(), nullable=True), schema='save')
    op.add_column('store_product', sa.Column('brand', sa.Text(), nullable=True), schema='save')
    op.add_column('store_product', sa.Column('size_text', sa.Text(), nullable=True), schema='save')
    op.add_column('store_product', sa.Column('image_url', sa.Text(), nullable=True), schema='save')

    # 1.2 — motivo de rechazo + costo del juez en product_match (nullable).
    op.add_column('product_match', sa.Column('reason_code', sa.Text(), nullable=True), schema='save')
    op.add_column('product_match', sa.Column('reason_note', sa.Text(), nullable=True), schema='save')
    op.add_column('product_match', sa.Column('judge_input_tokens', sa.Integer(), nullable=True), schema='save')
    op.add_column('product_match', sa.Column('judge_output_tokens', sa.Integer(), nullable=True), schema='save')
    op.add_column('product_match', sa.Column('judge_model', sa.Text(), nullable=True), schema='save')

    # 1.4 — logo del proveedor (paste-URL).
    op.add_column('provider', sa.Column('logo_url', sa.Text(), nullable=True), schema='save')

    # 1.3 — snapshot de candidatos por fila de revisión (top-N; cap en código).
    op.create_table(
        'review_candidate',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('product_match_id', sa.UUID(), nullable=False),
        sa.Column('canonical_product_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.Text(), nullable=True),
        sa.Column('brand', sa.Text(), nullable=True),
        sa.Column('score', sa.Numeric(precision=5, scale=4), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['product_match_id'], ['save.product_match.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['canonical_product_id'], ['save.canonical_product.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('product_match_id', 'canonical_product_id', name='uq_review_candidate_match_canonical'),
        schema='save',
    )
    op.create_index('ix_review_candidate_product_match', 'review_candidate', ['product_match_id'], schema='save')

    # 1.5 — config de fuente de extracción por proveedor (1:1 en B1).
    op.create_table(
        'store_registry',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('provider_id', sa.UUID(), nullable=False),
        sa.Column('platform', sa.Text(), nullable=False),
        sa.Column('base_url', sa.Text(), nullable=False),
        sa.Column('endpoints', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('headers', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('auth', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('enabled', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('health_status', sa.Text(), nullable=True),
        sa.Column('paused_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['provider_id'], ['save.provider.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('provider_id', name='uq_store_registry_provider'),
        schema='save',
    )

    # 1.6 — canasta curada como dato (reemplaza BASKET_QUERIES; backfill en 3.15).
    op.create_table(
        'basket_query',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('market_id', sa.Text(), nullable=False),
        sa.Column('category_label', sa.Text(), nullable=True),
        sa.Column('query_text', sa.Text(), nullable=False),
        sa.Column('position', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('market_id', 'query_text', name='uq_basket_query_market_text'),
        schema='save',
    )


def downgrade() -> None:
    op.drop_table('basket_query', schema='save')
    op.drop_table('store_registry', schema='save')
    op.drop_index('ix_review_candidate_product_match', table_name='review_candidate', schema='save')
    op.drop_table('review_candidate', schema='save')

    op.drop_column('provider', 'logo_url', schema='save')

    op.drop_column('product_match', 'judge_model', schema='save')
    op.drop_column('product_match', 'judge_output_tokens', schema='save')
    op.drop_column('product_match', 'judge_input_tokens', schema='save')
    op.drop_column('product_match', 'reason_note', schema='save')
    op.drop_column('product_match', 'reason_code', schema='save')

    op.drop_column('store_product', 'image_url', schema='save')
    op.drop_column('store_product', 'size_text', schema='save')
    op.drop_column('store_product', 'brand', schema='save')
    op.drop_column('store_product', 'name', schema='save')
