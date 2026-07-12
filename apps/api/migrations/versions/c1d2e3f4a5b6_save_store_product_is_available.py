"""save: store_product.is_available (F3.0 — disponibilidad por tienda para Loop B)

Agrega `is_available` a `save.store_product`. Loop B (cobertura) lo pone en `false` cuando busca un
canónico en una tienda y ya no lo vende, SIN borrar el registro (semántica `hidden` de SupermercadosRD
`apply-scrape-result.ts:39-94`). Default `true`: todo store_product existente sigue disponible.

Revision ID: c1d2e3f4a5b6
Revises: 631c00a200fb
Create Date: 2026-07-12
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "c1d2e3f4a5b6"
down_revision = "631c00a200fb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "store_product",
        sa.Column("is_available", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        schema="save",
    )


def downgrade() -> None:
    op.drop_column("store_product", "is_available", schema="save")
