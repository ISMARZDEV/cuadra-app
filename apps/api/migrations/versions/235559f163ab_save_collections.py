"""save_collections — colecciones curadas (A6): tablas `collection` + `collection_product` (M:N).

Autogenerate incluía DROPs de tablas AJENAS a esta app (checkpoints de langgraph,
spike_transaction) que solo existen en la DB local; se removieron a mano. Esta migración crea
ÚNICAMENTE el schema de colecciones.

Revision ID: 235559f163ab
Revises: a7b8c9d0e1f2
Create Date: 2026-07-04 21:42:09.229192
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "235559f163ab"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "collection",
        sa.Column(
            "id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("market_id", sa.Text(), nullable=False),
        sa.Column("position", sa.SmallInteger(), server_default="0", nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("market_id", "slug", name="uq_collection_market_slug"),
        schema="save",
    )
    op.create_table(
        "collection_product",
        sa.Column(
            "id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("collection_id", sa.UUID(), nullable=False),
        sa.Column("canonical_product_id", sa.UUID(), nullable=False),
        sa.Column("position", sa.SmallInteger(), server_default="0", nullable=False),
        sa.ForeignKeyConstraint(
            ["canonical_product_id"], ["save.canonical_product.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["collection_id"], ["save.collection.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "collection_id", "canonical_product_id", name="uq_collection_product"
        ),
        schema="save",
    )
    op.create_index(
        "ix_collection_product_collection",
        "collection_product",
        ["collection_id"],
        unique=False,
        schema="save",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_collection_product_collection", table_name="collection_product", schema="save"
    )
    op.drop_table("collection_product", schema="save")
    op.drop_table("collection", schema="save")
