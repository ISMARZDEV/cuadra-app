"""save: slug público en canonical_product (SEO, ancla F1)

Revision ID: b2c3d4e5f6a7
Revises: 235559f163ab
Create Date: 2026-07-05 01:00:00.000000

Slug legible POR-MERCADO como llave PÚBLICA del producto en la URL
(`/product/arroz-selecto-wala-5-lb`) en vez del UUID → destraba `og:image` y `<link rel=canonical>`.
Se agrega nullable, se backfillea desde nombre+marca+tamaño (mismo criterio que `product_slug` del
dominio, deduplicando por mercado con sufijo `-2`), se impone `UNIQUE(market_id, slug)` (espeja
`collection`) y se pasa a NOT NULL. El slug de las filas NUEVAS lo asigna el repo al persistir.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from src.contexts.save.domain.slug import product_slug

revision = 'b2c3d4e5f6a7'
down_revision = '235559f163ab'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'canonical_product', sa.Column('slug', sa.Text(), nullable=True), schema='save'
    )
    _backfill_slugs()
    op.create_unique_constraint(
        'uq_canonical_product_market_slug',
        'canonical_product',
        ['market_id', 'slug'],
        schema='save',
    )
    op.alter_column('canonical_product', 'slug', nullable=False, schema='save')


def _backfill_slugs() -> None:
    """Slug determinista por fila, único por mercado (mismo dedupe que el repo)."""
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT cp.id, cp.name, cp.display_size, cp.market_id, b.name AS brand "
            "FROM save.canonical_product cp "
            "LEFT JOIN save.brand b ON b.id = cp.brand_id"
        )
    ).fetchall()
    seen: dict[str, set[str]] = {}
    for r in rows:
        base = product_slug(r.name, r.brand, r.display_size) or 'producto'
        market_seen = seen.setdefault(r.market_id, set())
        candidate, n = base, 2
        while candidate in market_seen:
            candidate, n = f"{base}-{n}", n + 1
        market_seen.add(candidate)
        conn.execute(
            sa.text("UPDATE save.canonical_product SET slug = :slug WHERE id = :id"),
            {"slug": candidate, "id": r.id},
        )


def downgrade() -> None:
    op.drop_constraint(
        'uq_canonical_product_market_slug', 'canonical_product', schema='save', type_='unique'
    )
    op.drop_column('canonical_product', 'slug', schema='save')
