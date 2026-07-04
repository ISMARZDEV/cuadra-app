"""save: push_token (Expo push notifications, G4)

Revision ID: a7b8c9d0e1f2
Revises: f1a2b3c4d5e6
Create Date: 2026-07-04 16:20:00.000000

Expo push token por dispositivo del usuario → el matching de alertas envía el push (el 'buzz' del
teléfono). Único por `token` (un token identifica un dispositivo; re-registrar reasigna el user).
`user_id` cross-context (identity), SIN FK (ADR 33).
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'a7b8c9d0e1f2'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'push_token',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('token', sa.Text(), nullable=False),
        sa.Column('platform', sa.Text(), nullable=False),  # ios|android
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token', name='uq_push_token_token'),
        schema='save',
    )
    op.create_index('ix_push_token_user', 'push_token', ['user_id'], schema='save')


def downgrade() -> None:
    op.drop_index('ix_push_token_user', 'push_token', schema='save')
    op.drop_table('push_token', schema='save')
