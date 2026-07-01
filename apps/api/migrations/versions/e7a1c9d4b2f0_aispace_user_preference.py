"""aispace schema — user_preference (personality)

Revision ID: e7a1c9d4b2f0
Revises: 4cb3e311c6a6
Create Date: 2026-06-29 14:30:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'e7a1c9d4b2f0'
down_revision = '4cb3e311c6a6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS aispace")   # ADR 33: schema por contexto
    op.create_table(
        'user_preference',
        sa.Column('user_id', sa.UUID(), nullable=False),   # ref a identity.user POR ID (sin FK cross-context)
        sa.Column('personality', sa.Text(), server_default='coach', nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('user_id'),
        schema='aispace',
    )


def downgrade() -> None:
    op.drop_table('user_preference', schema='aispace')
    op.execute("DROP SCHEMA IF EXISTS aispace CASCADE")
