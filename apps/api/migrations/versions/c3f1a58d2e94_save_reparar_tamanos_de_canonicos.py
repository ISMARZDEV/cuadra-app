"""save: reparar tamanos de canonicos creados desde el panel de la cola

El panel del detalle de la Cola de revisión mandaba `quantity_amount`/`quantity_measure` calculados
en TypeScript, SIN convertir a unidad base y SIN `display_size`. Consecuencia doble:

  - `size_amount` quedaba fuera de escala ("355 Ml" se guardaba como 355 LITROS, no 0.355);
  - `display_size` quedaba NULL, y como la consola de Productos Canónicos renderiza Tamaño/Peso
    desde esa columna (`CanonicalProductRow`), las píldoras salían vacías.

El endpoint ya no acepta cantidades del cliente: recibe `size_text` y deriva con `parse_size` del
dominio. Esta migración repara lo que quedó mal antes del arreglo, recalculando desde el
`size_text` del `store_product` enlazado — la MISMA fuente que usa el lote.

⚠️ La tabla de conversión está INLINEADA a propósito, NO importada de
`src/contexts/save/domain/value_objects/size_parser.py`. Una migración es un registro histórico:
debe producir el mismo resultado dentro de un año aunque el dominio cambie sus factores. Si alguien
"arregla" esta duplicación importando el dominio, rompe esa garantía.

Alcance deliberadamente estrecho — sólo se toca una fila si TODO esto se cumple:
  - `display_size IS NULL` (la firma del bug: los caminos correctos siempre lo llenan);
  - tiene un `store_product` enlazado con `size_text` parseable como "<número> <unidad>";
  - la unidad es una de las que el dominio sabe convertir.
Los multipacks ("6x350 Ml") NO se tocan: son raros y parsearlos en SQL sería reimplementar el
dominio a medias. Quedan para corrección manual desde el detalle.

Revision ID: c3f1a58d2e94
Revises: b2e4f7a91c3d
Create Date: 2026-07-30 18:02:11.417329
"""
from __future__ import annotations

from alembic import op

revision = 'c3f1a58d2e94'
down_revision = 'b2e4f7a91c3d'
branch_labels = None
depends_on = None


# Congelado desde `_UNITS` + `_DISPLAY_UNIT` del dominio al 2026-07-30. Ver la nota de arriba.
_REPAIR = """
WITH units(token, measure, factor, display) AS (
    VALUES
        ('lb', 'mass', 0.45359237, 'Lb'),
        ('lbs', 'mass', 0.45359237, 'Lb'),
        ('libra', 'mass', 0.45359237, 'Lb'),
        ('libras', 'mass', 0.45359237, 'Lb'),
        ('kg', 'mass', 1, 'Kg'),
        ('kgs', 'mass', 1, 'Kg'),
        ('kilo', 'mass', 1, 'Kg'),
        ('kilos', 'mass', 1, 'Kg'),
        ('g', 'mass', 0.001, 'Gr'),
        ('gr', 'mass', 0.001, 'Gr'),
        ('grs', 'mass', 0.001, 'Gr'),
        ('gramo', 'mass', 0.001, 'Gr'),
        ('gramos', 'mass', 0.001, 'Gr'),
        ('oz', 'mass', 0.028349523125, 'Oz'),
        ('onz', 'mass', 0.028349523125, 'Oz'),
        ('onza', 'mass', 0.028349523125, 'Oz'),
        ('onzas', 'mass', 0.028349523125, 'Oz'),
        ('l', 'volume', 1, 'Lt'),
        ('lt', 'volume', 1, 'Lt'),
        ('lts', 'volume', 1, 'Lt'),
        ('litro', 'volume', 1, 'Lt'),
        ('litros', 'volume', 1, 'Lt'),
        ('ml', 'volume', 0.001, 'Ml'),
        ('gl', 'volume', 3.78541, 'Gl'),
        ('gal', 'volume', 3.78541, 'Gl'),
        ('galon', 'volume', 3.78541, 'Gl'),
        ('galón', 'volume', 3.78541, 'Gl'),
        ('und', 'count', 1, 'Un'),
        ('un', 'count', 1, 'Un'),
        ('u', 'count', 1, 'Un'),
        ('uds', 'count', 1, 'Un'),
        ('unidad', 'count', 1, 'Un'),
        ('unidades', 'count', 1, 'Un'),
        ('pza', 'count', 1, 'Un'),
        ('pzas', 'count', 1, 'Un'),
        ('pack', 'count', 1, 'Un')
),
-- Un canónico puede tener varias tiendas enlazadas: se elige la de `id` menor para que correr la
-- migración dos veces dé exactamente el mismo resultado.
candidate AS (
    SELECT DISTINCT ON (cp.id)
        cp.id AS canonical_id,
        sp.size_text AS raw
    FROM save.canonical_product cp
    JOIN save.store_product sp ON sp.canonical_product_id = cp.id
    WHERE cp.display_size IS NULL
      AND sp.size_text IS NOT NULL
      AND sp.size_text ~ '^\\s*\\d+([.,]\\d+)?\\s*[a-zA-Zá]+\\.?\\s*$'
    ORDER BY cp.id, sp.id
),
parsed AS (
    SELECT
        canonical_id,
        replace(substring(raw from '^\\s*(\\d+(?:[.,]\\d+)?)'), ',', '.')::numeric AS number,
        lower(substring(raw from '([a-zA-Zá]+)\\.?\\s*$')) AS token
    FROM candidate
)
UPDATE save.canonical_product cp
SET size_amount = ROUND(p.number * u.factor, 8),
    size_measure = u.measure,
    -- misma forma que `normalize_size_text`: "2.0 Lbs" -> "2 Lb", "1,5 Lt" -> "1.5 Lt"
    display_size = CASE
        WHEN p.number = trunc(p.number) THEN trunc(p.number)::bigint::text
        ELSE rtrim(rtrim(p.number::text, '0'), '.')
    END || ' ' || u.display
FROM parsed p
JOIN units u ON u.token = p.token
WHERE cp.id = p.canonical_id
  -- `Quantity` exige cantidad > 0; no dejar que la reparación cree un estado que el dominio
  -- rechazaría al releer la fila.
  AND ROUND(p.number * u.factor, 8) > 0;
"""


def upgrade() -> None:
    op.execute(_REPAIR)


def downgrade() -> None:
    """No-op DELIBERADO.

    Después de reparar no queda forma de distinguir qué fila estaba rota: el estado "correcto" y el
    "reparado" son idénticos. Revertir tendría que volver a poner `display_size = NULL` y una
    cantidad mal escalada en filas que hoy están bien — destruiría datos buenos para simular un bug.
    """
