"""save: orchestration policy + global config (F4)

Revision ID: 986cfadeb758
Revises: 846dbc871bfe
Create Date: 2026-07-19 10:26:41.970492

LIMPIADA A MANO. El autogenerate propuso, además de estas dos tablas, una tanda de DROPs
destructivos que NO tienen que ver con este cambio:

  - `checkpoints` / `checkpoint_blobs` / `checkpoint_writes` / `checkpoint_migrations`
    → las crea LangGraph por su cuenta (checkpointer de Postgres), no Alembic. Dropearlas
      borra la memoria conversacional del agente.
  - `ix_canonical_product_embedding` (HNSW/pgvector) e `ix_canonical_product_name_trgm`
    (GIN/pg_trgm) → llevan opclasses custom que el autogenerate no reconcilia y propone
      recrear/dropear. Sin ellos la cascada de matching NO falla: degrada a sequential scan.
      Es decir, seguiría "andando" mientras se vuelve inservible — mienten en verde.
  - `ix_store_product_freshness`, `spike_transaction` → idem, fuera de este alcance.

Regla que esto confirma (cuadra-api §4): autogenerate PROPONE, el humano DISPONE.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = '986cfadeb758'
down_revision = '846dbc871bfe'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'orchestration_global_config',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('market_id', sa.Text(), nullable=False),
        sa.Column('default_query_limit', sa.Integer(), nullable=False),
        sa.Column(
            'default_timezone', sa.Text(), server_default='America/Santo_Domingo', nullable=False
        ),
        sa.Column('default_sla_minutes', sa.Integer(), nullable=True),
        sa.Column('auto_runs_enabled', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('market_id', name='uq_orchestration_config_market'),
        schema='save',
    )
    op.create_table(
        'orchestration_policy',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('scope', sa.Text(), nullable=False),
        sa.Column('market_id', sa.Text(), nullable=False),
        sa.Column('provider_id', sa.UUID(), nullable=True),
        sa.Column('flow_key', sa.Text(), nullable=True),
        sa.Column('asset_key', sa.Text(), nullable=True),
        sa.Column('execution_mode', sa.Text(), server_default='manual', nullable=False),
        sa.Column('cron_expression', sa.Text(), nullable=True),
        sa.Column(
            'timezone', sa.Text(), server_default='America/Santo_Domingo', nullable=False
        ),
        sa.Column('sla_minutes', sa.Integer(), nullable=True),
        sa.Column('query_limit_override', sa.Integer(), nullable=True),
        sa.Column('priority', sa.Integer(), nullable=True),
        sa.Column('enabled', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('next_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.ForeignKeyConstraint(['provider_id'], ['save.provider.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        schema='save',
    )
    op.create_index(
        'ix_orchestration_policy_market',
        'orchestration_policy',
        ['market_id'],
        unique=False,
        schema='save',
    )
    # Único PARCIAL: una policy soft-deleted (deleted_at NOT NULL) no debe bloquear la creación de
    # su reemplazo. Sin el WHERE, retirar y recrear una policy sería imposible sin hard-delete —
    # justo lo que §5.3 prohíbe.
    op.create_index(
        'uq_orchestration_policy_active',
        'orchestration_policy',
        ['scope', 'provider_id', 'market_id', 'flow_key'],
        unique=True,
        schema='save',
        postgresql_where=sa.text('deleted_at IS NULL'),
    )


def downgrade() -> None:
    op.drop_index(
        'uq_orchestration_policy_active',
        table_name='orchestration_policy',
        schema='save',
        postgresql_where=sa.text('deleted_at IS NULL'),
    )
    op.drop_index(
        'ix_orchestration_policy_market', table_name='orchestration_policy', schema='save'
    )
    op.drop_table('orchestration_policy', schema='save')
    op.drop_table('orchestration_global_config', schema='save')
