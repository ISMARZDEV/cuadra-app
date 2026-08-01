"""save: fusionar marcas duplicadas y hacer imposible reincidir

`save.brand` tiene unicidad por `(market_id, name)` — comparación EXACTA. Eso dejaba entrar la
misma marca escrita de varias formas, y `_get_or_create_brand_id` la buscaba igual de exacto, así
que cada variante creaba una fila nueva. Medido sobre la base real: 29 marcas, **4 grupos
duplicados y 5 filas de más**:

    Bravo / BRAVO · La Famosa / LA FAMOSA · LIDER / Líder / LÍDER · One / ONE

El daño no era cosmético: el filtro por marca dejaba fuera la mitad de los productos de una marca,
y el reconocimiento de marcas (`domain/brand_from_name`) devolvía una u otra variante según cuál
hubiera entrado primero en la base.

Esta migración hace tres cosas, en este orden:

1. **Fusiona** cada grupo: gana la variante MÁS USADA; a empate, la que conserva acentos (lleva más
   información) y luego la primera alfabéticamente. `canonical_product.brand_id` se repunta al
   superviviente y las sobrantes se borran. Es seguro porque `canonical_product.brand_id` es el
   ÚNICO FK que apunta a `save.brand`.
2. **Normaliza** el nombre del superviviente a MAYÚSCULA (`normalize_brand`, US-CP-L7), CONSERVANDO
   los acentos: "LÍDER" es el nombre correcto de la marca; "LIDER" sería escribirlo mal.
3. **Crea un índice único funcional** sobre la identidad plegada. Sin él esto se repite: el arreglo
   de `_get_or_create_brand_id` evita el caso normal, pero sólo la base puede garantizarlo.

⚠️ El plegado va INLINE con `translate()` y no se importa del dominio: una migración es un registro
histórico y debe dar el mismo resultado aunque la regla del dominio cambie. `unaccent()` no serviría
—no está instalada y además no es IMMUTABLE, así que no puede indexarse—; `translate()` sí lo es.

Revision ID: d7c4b2e91f58
Revises: c3f1a58d2e94
Create Date: 2026-07-30 22:41:07.882145
"""
from __future__ import annotations

from alembic import op

revision = 'd7c4b2e91f58'
down_revision = 'c3f1a58d2e94'
branch_labels = None
depends_on = None

# Congelado al 2026-07-30 desde `brand_key` (`domain/canonical_import.py`).
_ACCENTS = "ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ"
_PLAIN = "AAAAAEEEEIIIIOOOOOUUUUNC"
_KEY = f"translate(upper(btrim(name)), '{_ACCENTS}', '{_PLAIN}')"

_INDEX_NAME = "uq_brand_market_key"

_B_KEY = _KEY.replace("name", "b.name")

# Se resuelve en TRES sentencias, no en un CTE que actualice y borre a la vez: dentro de una sola
# sentencia el orden entre el UPDATE del FK y el DELETE de la fila apuntada no está garantizado, y
# eso es exactamente lo que no se quiere dejar al azar en una migración de datos.
#
# Gana la más usada; a empate la que TIENE acentos (lleva más información) y luego la primera
# alfabéticamente. El desempate importa: sin él, dos bases con los mismos datos podrían quedarse
# con supervivientes distintos.
_PLAN = f"""
CREATE TEMP TABLE _brand_merge ON COMMIT DROP AS
WITH ranked AS (
    SELECT
        b.id,
        b.market_id,
        {_B_KEY} AS fold_key,
        row_number() OVER (
            PARTITION BY b.market_id, {_B_KEY}
            ORDER BY
                (SELECT count(*) FROM save.canonical_product cp WHERE cp.brand_id = b.id) DESC,
                (upper(btrim(b.name)) <> {_B_KEY}) DESC,
                b.name ASC
        ) AS rn
    FROM save.brand b
),
winners AS (SELECT market_id, fold_key, id FROM ranked WHERE rn = 1)
SELECT r.id AS loser_id, w.id AS winner_id
FROM ranked r
JOIN winners w ON w.market_id = r.market_id AND w.fold_key = r.fold_key
WHERE r.rn > 1;
"""

_REPOINT = """
UPDATE save.canonical_product cp
SET brand_id = m.winner_id
FROM _brand_merge m
WHERE cp.brand_id = m.loser_id;
"""

_DROP_LOSERS = "DELETE FROM save.brand WHERE id IN (SELECT loser_id FROM _brand_merge);"

# Casing canónico para TODAS las supervivientes, no sólo las fusionadas: `Bravo` sin duplicado
# igual debía quedar `BRAVO`.
_NORMALIZE = "UPDATE save.brand SET name = upper(btrim(name)) WHERE name <> upper(btrim(name));"


def upgrade() -> None:
    op.execute(_PLAN)
    op.execute(_REPOINT)
    op.execute(_DROP_LOSERS)
    op.execute(_NORMALIZE)
    op.execute(f"CREATE UNIQUE INDEX {_INDEX_NAME} ON save.brand (market_id, ({_KEY}))")


def downgrade() -> None:
    """Sólo se quita el índice.

    Las marcas fusionadas NO se pueden separar: al repuntar los canónicos se perdió cuál de ellos
    apuntaba a qué variante. Recrear filas vacías con la grafía vieja simularía el estado anterior
    sin restaurarlo, y dejaría el catálogo peor que ahora.
    """
    op.execute(f"DROP INDEX IF EXISTS save.{_INDEX_NAME}")
