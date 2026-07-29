"""save: archivado soft-delete de provider

`provider.id` está referenciado por FK desde `store_registry.provider_id` y
`store_product.provider_id`. Un DELETE real de un provider con productos ingestados o revienta
contra la FK, o —si alguien la pusiera en CASCADE— se lleva por delante el histórico de precios
completo de esa cadena.

`archived_at` (NULL = activo) saca el provider de la consola y de la ingesta sin borrar una sola
fila. Mismo patrón que `canonical_product.archived_at` (migración 1b48d0f4dc93), para que
restaurar sea la inversa exacta de archivar.

Revision ID: b2e4f7a91c3d
Revises: 6c5a4babce47
Create Date: 2026-07-27 01:40:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'b2e4f7a91c3d'
down_revision = '6c5a4babce47'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "provider",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        schema="save",
    )
    # Índice parcial: la consulta que corre en CADA request del listado es
    # "market_id = ? AND archived_at IS NULL". El parcial pesa lo que los activos, no la tabla.
    op.create_index(
        "ix_provider_market_active",
        "provider",
        ["market_id"],
        unique=False,
        schema="save",
        postgresql_where=sa.text("archived_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_provider_market_active", table_name="provider", schema="save")
    op.drop_column("provider", "archived_at", schema="save")
