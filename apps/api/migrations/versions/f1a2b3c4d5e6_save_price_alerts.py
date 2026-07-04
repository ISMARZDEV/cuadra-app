"""save: price_alert + alert_notification (G4)

Revision ID: f1a2b3c4d5e6
Revises: d4e8f21a9c07
Create Date: 2026-07-04 15:45:00.000000

Alertas de precio (G4): `price_alert` = suscripción de un usuario a un producto (umbral opcional);
`alert_notification` = evento disparado (feed in-app), idempotente por (alerta, tienda, captured_at)
para no re-avisar la misma bajada. `user_id` es cross-context (identity) → por ID, SIN FK (ADR 33).
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'f1a2b3c4d5e6'
down_revision = 'd4e8f21a9c07'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'price_alert',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),  # cross-context (identity), sin FK
        sa.Column('canonical_product_id', sa.UUID(), nullable=False),
        sa.Column('market_id', sa.Text(), nullable=False),
        sa.Column('threshold_minor', sa.BigInteger(), nullable=True),  # null = cualquier bajada
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['canonical_product_id'], ['save.canonical_product.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'canonical_product_id', name='uq_price_alert_user_product'),
        schema='save',
    )
    op.create_index('ix_price_alert_user', 'price_alert', ['user_id'], schema='save')

    op.create_table(
        'alert_notification',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('price_alert_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('canonical_product_id', sa.UUID(), nullable=False),
        sa.Column('product_name', sa.Text(), nullable=False),
        sa.Column('provider_name', sa.Text(), nullable=False),
        sa.Column('previous_minor', sa.BigInteger(), nullable=False),
        sa.Column('current_minor', sa.BigInteger(), nullable=False),
        sa.Column('currency', sa.CHAR(length=3), nullable=False),
        sa.Column('drop_bps', sa.SmallInteger(), nullable=False),
        sa.Column('captured_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('triggered_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['price_alert_id'], ['save.price_alert.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'price_alert_id', 'provider_name', 'captured_at',
            name='uq_alert_notification_dedup',
        ),
        schema='save',
    )
    op.create_index('ix_alert_notification_user', 'alert_notification', ['user_id'], schema='save')


def downgrade() -> None:
    op.drop_index('ix_alert_notification_user', 'alert_notification', schema='save')
    op.drop_table('alert_notification', schema='save')
    op.drop_index('ix_price_alert_user', 'price_alert', schema='save')
    op.drop_table('price_alert', schema='save')
