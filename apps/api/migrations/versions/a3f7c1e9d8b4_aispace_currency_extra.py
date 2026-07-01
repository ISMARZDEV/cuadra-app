"""aispace user_preference — currency_extra (hasta 3 monedas adicionales)

Revision ID: a3f7c1e9d8b4
Revises: e7a1c9d4b2f0
Create Date: 2026-06-30 08:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'a3f7c1e9d8b4'
down_revision = 'e7a1c9d4b2f0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'user_preference',
        sa.Column(
            'currency_extra', sa.ARRAY(sa.Text()), server_default='{}', nullable=False
        ),
        schema='aispace',
    )


def downgrade() -> None:
    op.drop_column('user_preference', 'currency_extra', schema='aispace')
