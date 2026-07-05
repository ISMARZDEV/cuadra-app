"""save matching foundation (pgvector + trgm + product_match)

Revision ID: 614e370d452c
Revises: b2c3d4e5f6a7
Create Date: 2026-07-05 14:54:03.235902

F2.0 — fundamento de matching (cascada EAN -> trgm -> pgvector -> Claude-judge -> revisión
humana, ver design sdd/save-matching). Primera vez que este proyecto habilita `vector` y
`pg_trgm` (autogenerate NO crea extensions, igual que el schema `save` en c73bedb700cf —
editada a mano).

Agrega:
  - `save.canonical_product.embedding vector(1024)` + índice HNSW (m=16, ef_construction=100,
    vector_cosine_ops) para el candidate-search semántico.
  - índice GIN trgm sobre `canonical_product.name` para el candidate-search léxico.
  - `save.product_match`: fuente única de verdad del linkage store_product<->canonical_product
    (confidence/method/status/auditoría). `store_product.canonical_product_id` sigue siendo un
    puntero denormalizado que la cascada escribe SOLO junto con la fila de `product_match`, en
    la misma transacción (invariante de aplicación, no trigger — ADR 31).
  - `decided_by` es TEXT plano (no FK): ADR 33 prohíbe FKs cruzando schemas / hacia `identity`.

CONSTRAINT NOTE — consistencia del embedding (léase antes de tocar el modelo de embeddings):
  Solo UN modelo de embeddings puede poblar `embedding` a la vez. Los vectores de modelos
  distintos NO son comparables entre sí (distancias coseno de espacios distintos no tienen
  significado). Cualquier cambio futuro de modelo (p.ej. BGE-M3 -> Qwen3-Embedding-0.6B)
  EXIGE: (1) re-embed completo del catálogo con el modelo nuevo, (2) reindex del HNSW, todo
  vía una migración NUEVA — nunca un simple flip de config/env var. Mezclar vectores de dos
  modelos en la misma columna corrompe silenciosamente el candidate-search semántico.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = '614e370d452c'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Extensions (globales al cluster, no al schema `save` — igual que CREATE SCHEMA en c73bedb700cf,
    # autogenerate no las gestiona).
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # Embedding semántico (BGE-M3, dim=1024) sobre canonical_product — ver CONSTRAINT NOTE arriba.
    op.execute("ALTER TABLE save.canonical_product ADD COLUMN embedding vector(1024)")
    op.execute(
        "CREATE INDEX ix_canonical_product_embedding ON save.canonical_product "
        "USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 100)"
    )
    op.execute(
        "CREATE INDEX ix_canonical_product_name_trgm ON save.canonical_product "
        "USING gin (name gin_trgm_ops)"
    )

    op.create_table(
        'product_match',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('store_product_id', sa.UUID(), nullable=False),
        sa.Column('canonical_product_id', sa.UUID(), nullable=True),
        sa.Column('confidence', sa.Numeric(precision=5, scale=4), nullable=False),
        sa.Column('method', sa.Text(), nullable=False),
        sa.Column('status', sa.Text(), nullable=False),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('decided_by', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['store_product_id'], ['save.store_product.id']),
        sa.ForeignKeyConstraint(['canonical_product_id'], ['save.canonical_product.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('store_product_id', name='uq_product_match_store_product'),
        sa.CheckConstraint(
            "method IN ('ean','trgm','vector','hybrid','llm','human')",
            name='ck_product_match_method',
        ),
        sa.CheckConstraint(
            "status IN ('auto_linked','pending_review','rejected')",
            name='ck_product_match_status',
        ),
        schema='save',
    )


def downgrade() -> None:
    op.drop_table('product_match', schema='save')
    op.execute("DROP INDEX IF EXISTS save.ix_canonical_product_name_trgm")
    op.execute("DROP INDEX IF EXISTS save.ix_canonical_product_embedding")
    op.execute("ALTER TABLE save.canonical_product DROP COLUMN IF EXISTS embedding")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
    op.execute("DROP EXTENSION IF EXISTS vector")
