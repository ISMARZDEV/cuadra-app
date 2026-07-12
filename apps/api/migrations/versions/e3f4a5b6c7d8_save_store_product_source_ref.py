"""save: store_product.source_ref (§15.3 — localizador de detalle para el re-fetch por id)

Agrega `source_ref` (JSONB, nullable) a `save.store_product`: localizador(es) extra para el re-fetch
por-producto (camino A de F3.2a / fuentes autenticadas) cuando `external_id` no alcanza. Bravo guarda
`{"id_articulo": "29866"}` (su `/get` usa idArticulo, no el idexterno que es el external_id). NULL para
las plataformas donde `external_id` (VTEX productId / Magento SKU) ya es el localizador.

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-07-12
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "e3f4a5b6c7d8"
down_revision = "d2e3f4a5b6c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "store_product",
        sa.Column("source_ref", JSONB(), nullable=True),
        schema="save",
    )


def downgrade() -> None:
    op.drop_column("store_product", "source_ref", schema="save")
