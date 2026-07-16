"""save: normaliza store_product.ean a GTIN-14 y descarta los códigos internos

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-07-16 00:00:00.000000

R6 (Fase 0 · higiene) — impone sobre las filas existentes el invariante de `store_product.ean`:
**o es un GTIN-14 global normalizado, o es NULL.**

## Por qué

La etapa EAN de la cascada auto-enlaza con score 1.0 **sin revisión humana**. Eso la hace la más
barata y la más peligrosa: lo que entre mal ahí produce un FALSE MERGE (dos SKUs distintos unificados),
que la doctrina de Save nombra como el peor caso posible — corrompe toda comparación construida encima
y nadie lo revisa, porque fue automático.

Hasta 2026-07-16 el adapter de VTEX escribía `ean` CRUDO (`first.get("ean")`, sin normalizar ni
filtrar), mientras que Bravo sí pasaba por `pick_global_ean`. Como **Sirena es el SEMBRADOR** de
barcodes (100% de cobertura — es la tienda que hace efectivo el job por EAN de Bravo), esa ruta sin
guarda contaminó la columna. Medido contra dev: **33 de 63 filas con EAN (52%) violaban el invariante,
todas de Sirena**:

  · 13 UPC-A de 12 díg. sin normalizar → Bravo escribe `760593023182` y Sirena `0760593023182`:
    el MISMO barcode que nunca converge → la etapa EAN jamás los enlaza. Falso negativo INVISIBLE
    (se manifiesta como "no matchea").
  · 11 UPC-A con el cero inicial COMIDO (11 díg.) → un parseo numérico aguas arriba. Evidencia de
    que son UPC-A reales y no basura: 11/11 pasan checksum al restaurar el cero (azar = 10⁻¹¹) y el
    prefijo cuadra con la marca del nombre (41331 = Goya en "Guandules Verdes Goya").
  ·  7 códigos internos de 13 díg. (prefijo 2xx = peso variable) → a NULL.
  ·  2 GTIN-8 internos válidos (prefijo 2) → a NULL.

La ruta de ESCRITURA se arregla en el mismo PR (`vtex_adapter.map_vtex_product` → `pick_global_ean`).
Sin eso, este backfill se deshace en la próxima corrida de Sirena.

## Auto-contenida a propósito

La lógica GTIN se COPIA acá en vez de importarse de `src.contexts.save.domain.value_objects.ean`
(mismo criterio que el backfill de la canasta, `0990d45c068a`): una migración es un snapshot
histórico y debe seguir corriendo igual aunque el dominio cambie mañana. La versión viva del dominio
soporta además UPC-E; acá no hace falta — ninguna fuente actual lo publica y una migración no debe
crecer más allá de los datos que efectivamente tiene delante.

Idempotente: un GTIN-14 ya normalizado vuelve a parsear a sí mismo, así que reejecutar `upgrade()` no
cambia nada.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "f4a5b6c7d8e9"
down_revision = "e3f4a5b6c7d8"
branch_labels = None
depends_on = None

_GTIN14 = 14
_GTIN13 = 13
_GTIN12 = 12
_GTIN8 = 8
_UPCA_ZERO_STRIPPED = 11

# 200-299 restricted EAN-13 · 020-029 UPC-A sistema 2 (peso variable) · 040-049 UPC-A sistema 4
# (uso local) · 980-984 y 990-999 cupones/reembolsos. NO se filtran 977/978/979 (ISSN/ISBN): son
# identificadores globales de productos que un súper sí vende.
_RESTRICTED_PREFIXES = ((200, 299), (20, 29), (40, 49), (980, 984), (990, 999))
_RESTRICTED_GTIN8_LEADS = ("0", "2")


def _checksum_ok(gtin: str) -> bool:
    """mod-10 GS1 para cualquier largo: pesos 3,1,… contando DESDE el verificador hacia la izquierda."""
    body = [int(c) for c in gtin[-2::-1]]
    total = sum(d * (3 if i % 2 == 0 else 1) for i, d in enumerate(body))
    return (10 - total % 10) % 10 == int(gtin[-1])


def _restricted_prefix(gtin13_view: str) -> bool:
    return any(lo <= int(gtin13_view[:3]) <= hi for lo, hi in _RESTRICTED_PREFIXES)


def _normalize_global(code: str) -> str | None:
    """GTIN-14 canónico si el código es un barcode GLOBAL bien formado; `None` en cualquier otro caso."""
    code = code.strip()
    if not code.isdigit():
        return None

    if len(code) == _GTIN8:
        if not _checksum_ok(code) or code[0] in _RESTRICTED_GTIN8_LEADS:
            return None
        return code.rjust(_GTIN14, "0")

    if len(code) == _UPCA_ZERO_STRIPPED:
        code = "0" + code

    if len(code) not in (_GTIN12, _GTIN13, _GTIN14) or not _checksum_ok(code):
        return None

    gtin13_view = code[1:] if len(code) == _GTIN14 else code.rjust(_GTIN13, "0")
    if _restricted_prefix(gtin13_view):
        return None
    return code.rjust(_GTIN14, "0")


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, ean FROM save.store_product WHERE ean IS NOT NULL")
    ).all()

    normalized = dropped = 0
    for row_id, ean in rows:
        canonical = _normalize_global(ean)
        if canonical == ean:
            continue
        conn.execute(
            sa.text("UPDATE save.store_product SET ean = :ean WHERE id = :id"),
            {"ean": canonical, "id": row_id},
        )
        if canonical is None:
            dropped += 1
        else:
            normalized += 1

    print(
        f"save ean backfill: {normalized} normalizados a GTIN-14, {dropped} códigos internos a NULL "
        f"({len(rows)} filas con ean revisadas)"
    )


def downgrade() -> None:
    """No-op DELIBERADO: la normalización no es reversible y no debe fingir que lo es.

    La forma original se pierde por construcción (un GTIN-14 no dice si se escribió como UPC-A de 12
    o EAN-13 de 13), y los códigos internos se fueron a NULL a propósito — restaurarlos volvería a
    poner un false merge al alcance de la etapa que auto-enlaza sin revisión.

    No hay pérdida real: `ean` es un atributo DERIVADO de la fuente, no histórico. La próxima corrida
    de ingesta lo vuelve a traer, y ahora la ruta de escritura lo normaliza y filtra correctamente.
    El histórico sagrado (`price`, `product_match`) no lo toca esta migración.
    """
