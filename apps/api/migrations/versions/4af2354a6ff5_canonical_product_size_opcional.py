"""canonical_product: size opcional

No todo producto declara tamaño. Un plato para perro, un sándwich del mostrador, un pan por pieza o
una mandarina pelada se venden por unidad y sin peso: exigir `size_amount`/`size_measure` obligaba a
INVENTAR un número, que es justo lo que este módulo no se permite. Medido 2026-08-02: 19 productos
reales (8 de Bravo, 8 de Nacional, 3 de Sirena) no podían entrar al catálogo canónico por esto.

Sólo se afloja la restricción — NO se toca ningún dato existente. Los canónicos que hoy tienen
tamaño lo conservan; la columna simplemente admite ausencia a partir de ahora.

Lo que la ausencia implica, y ya está resuelto en el dominio:
  - sin cantidad NO hay precio por unidad base (`unit_price_or_none` devuelve `None`, jamás 0: un
    cero se ordenaría PRIMERO en «más barato por kilo» y pondría un plato para perro arriba de la
    comida);
  - el size gate del matcher se abstiene (`sizes_conflict` ya devolvía `False` con `None`);
  - la tabla comparativa se arma igual — los precios ABSOLUTOS se comparan siempre.

Revision ID: 4af2354a6ff5
Revises: efec6851fef7
Create Date: 2026-08-02 16:01:01.772372
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = '4af2354a6ff5'
down_revision = 'efec6851fef7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "canonical_product", "size_amount",
        existing_type=sa.Numeric(), nullable=True, schema="save",
    )
    op.alter_column(
        "canonical_product", "size_measure",
        existing_type=sa.Text(), nullable=True, schema="save",
    )


def downgrade() -> None:
    """Vuelve a exigirlo. OJO: falla si ya hay canónicos sin tamaño — y DEBE fallar. Completarlos
    con un valor cualquiera para poder revertir sería inventar justo el dato que este cambio existe
    para no inventar."""
    op.alter_column(
        "canonical_product", "size_measure",
        existing_type=sa.Text(), nullable=False, schema="save",
    )
    op.alter_column(
        "canonical_product", "size_amount",
        existing_type=sa.Numeric(), nullable=False, schema="save",
    )
