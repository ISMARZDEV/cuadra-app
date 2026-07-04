"""save: image_url + display_size en canonical_product

Revision ID: d4e8f21a9c07
Revises: c73bedb700cf
Create Date: 2026-07-04 15:05:00.000000

Presentación del producto (Imagen #2/#5): `image_url` (galería/card) y `display_size` = el tamaño
ORIGINAL de empaque tal cual ("10 LB"), distinto del `size_amount`/`size_measure` normalizado a
unidad base (kg/L/und). Ambos nullable (el catálogo viejo queda sin ellos hasta re-seed). `quality`
ya existía en la migración base.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'd4e8f21a9c07'
down_revision = 'c73bedb700cf'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'canonical_product', sa.Column('display_size', sa.Text(), nullable=True), schema='save'
    )
    op.add_column(
        'canonical_product', sa.Column('image_url', sa.Text(), nullable=True), schema='save'
    )


def downgrade() -> None:
    op.drop_column('canonical_product', 'image_url', schema='save')
    op.drop_column('canonical_product', 'display_size', schema='save')
