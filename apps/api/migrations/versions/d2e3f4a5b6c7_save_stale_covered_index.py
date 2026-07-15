"""save: índice para la staleness query de F3.2a (frescura)

Índice compuesto `(is_available, last_seen_at)` en `save.store_product` para la selección por frescura
de F3.2a (`list_stale_covered`): disponibles con last_seen_at viejo (>18h) u ocultos viejos (>3d). Sin
él, un catálogo grande obliga a un seq-scan por corrida frecuente. `canonical_product_id` no va en el
índice (el filtro NOT NULL es poco selectivo una vez cubierto casi todo).

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-07-12
"""
from __future__ import annotations

from alembic import op

revision = "d2e3f4a5b6c7"
down_revision = "c1d2e3f4a5b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_store_product_freshness",
        "store_product",
        ["is_available", "last_seen_at"],
        schema="save",
    )


def downgrade() -> None:
    op.drop_index("ix_store_product_freshness", table_name="store_product", schema="save")
