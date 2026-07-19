"""save: admin_audit_log (T2)

Revision ID: 846dbc871bfe
Revises: 3c16230fc37b
Create Date: 2026-07-18

Tabla APPEND-ONLY de auditoría de mutaciones del admin/OFV (fundación T2). Aditiva: no toca datos
existentes. El autogenerate proponía dropear tablas ajenas a Alembic (checkpoints de LangGraph,
spike_transaction) e índices HNSW/trgm/freshness — se descartaron (cuadra-api §4).
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '846dbc871bfe'
down_revision = '3c16230fc37b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'admin_audit_log',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('actor_user_id', sa.Text(), nullable=False),
        sa.Column('action', sa.Text(), nullable=False),
        sa.Column('target_type', sa.Text(), nullable=False),
        sa.Column('target_id', sa.Text(), nullable=False),
        sa.Column('payload_summary', postgresql.JSONB(astext_type=sa.Text()),
                  server_default='{}', nullable=False),
        sa.Column('market_id', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        schema='save',
    )
    op.create_index('ix_admin_audit_market_created', 'admin_audit_log',
                    ['market_id', 'created_at'], unique=False, schema='save')
    op.create_index('ix_admin_audit_target', 'admin_audit_log',
                    ['target_type', 'target_id'], unique=False, schema='save')


def downgrade() -> None:
    op.drop_index('ix_admin_audit_target', table_name='admin_audit_log', schema='save')
    op.drop_index('ix_admin_audit_market_created', table_name='admin_audit_log', schema='save')
    op.drop_table('admin_audit_log', schema='save')
