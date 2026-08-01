"""Importación masiva de canónicos (F5, US-CP-L8) — validación PURA (ADR 31).

El SDD manda tres pasos: cargar/pegar → previsualizar/validar → confirmar. Este módulo es el
paso del medio: dice fila por fila qué está mal y por qué, SIN tocar la base. Que la validación
sea pura es lo que permite que el preview sea barato y que el commit no descubra sorpresas.

Decisión de producto (SDD §7): `size_amount`/`size_measure` son NOT NULL en el modelo, así que
son obligatorios acá. La marca NO lo es — hay productos genéricos sin marca real y fabricar una
sería inventar catálogo.
"""
from __future__ import annotations

import unicodedata

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

# Espeja `UnitMeasure`; se declara acá para que la validación no dependa de importar el VO y
# poder nombrar el valor inválido en el mensaje de error.
VALID_MEASURES = ("mass", "volume", "count")


def normalize_amount_key(value: Decimal | str) -> str:
    """Cantidad → string canónico para comparar identidades.

    `size_amount` es `Numeric(18,8)`: la base devuelve `Decimal('1.00000000')` mientras que el CSV
    trae `'1'`. Compararlos como texto crudo hace que un duplicado REAL pase desapercibido, que es
    justo lo que el preview existe para evitar.

    Se usa `format(…, 'f')` y no `str()` porque `Decimal('100').normalize()` da `1E+2`.
    """
    try:
        return format(Decimal(str(value)).normalize(), "f")
    except (InvalidOperation, ValueError, TypeError):
        return str(value)


def normalize_brand(raw: str | None) -> str:
    """Casing canónico de marca: MAYÚSCULA (US-CP-L7).

    `save.brand` tiene unicidad por (mercado, nombre): sin normalizar, `goya`, `Goya` y `GOYA`
    entran como TRES marcas distintas y el filtro por marca deja de servir.

    Conserva los ACENTOS a propósito: es el nombre que se GUARDA y se muestra, y convertir "LÍDER"
    en "LIDER" sería escribir mal el nombre de una marca real. Para comparar, `brand_key`.
    """
    return (raw or "").strip().upper()


def brand_key(raw: str | None) -> str:
    """IDENTIDAD de una marca — se compara, NUNCA se muestra.

    `normalize_brand` no bastaba: sólo unifica el casing, así que `LIDER` y `LÍDER` seguían siendo
    dos marcas. Medido sobre la base real había 4 grupos duplicados (`Bravo`/`BRAVO`,
    `La Famosa`/`LA FAMOSA`, `LIDER`/`Líder`/`LÍDER`, `One`/`ONE`) que ensuciaban el filtro por
    marca y hacían que el reconocimiento de marcas dependiera de cuál variante viniera primero.

    ⚠️ El índice único de `save.brand` replica este plegado en SQL con `translate()`. Si se cambia
    la regla acá hay que cambiarla allá — y en esa dirección, no al revés: esta función pliega un
    SUPERCONJUNTO de lo que pliega el índice, así que nunca intentará insertar algo que el índice
    rechace.
    """
    decomposed = unicodedata.normalize("NFKD", (raw or "").strip())
    return "".join(c for c in decomposed if not unicodedata.combining(c)).upper()


@dataclass(frozen=True, slots=True)
class ImportRowInput:
    """Fila cruda tal como llega del CSV/pegado. Todo `str` porque un CSV no tiene tipos."""

    name: str
    size_amount: str
    size_measure: str
    brand: str | None = None
    display_size: str | None = None
    quality: str | None = None
    image_url: str | None = None
    category: str | None = None


@dataclass(frozen=True, slots=True)
class ValidatedImportRow:
    """Fila ya validada y normalizada, lista para crear el canónico."""

    row_index: int
    name: str
    brand: str
    size_amount: Decimal
    size_measure: str
    display_size: str | None = None
    quality: str | None = None
    image_url: str | None = None
    category: str | None = None

    @property
    def dedup_key(self) -> tuple[str, str, str, str]:
        """Identidad de producto a efectos de duplicado: nombre + marca + tamaño + unidad.

        Case-insensitive en el nombre — `Arroz Blanco` y `ARROZ BLANCO` son el mismo producto.
        El TAMAÑO entra en la llave a propósito: el mismo producto en otro tamaño es OTRO
        canónico (los gandules de 15 oz no son los de 820 gr), y confundirlos empuja al falso
        merge, que es el peor caso de Save.
        """
        return (
            self.name.strip().lower(),
            self.brand,
            normalize_amount_key(self.size_amount),
            self.size_measure,
        )


@dataclass(frozen=True, slots=True)
class ImportRowIssue:
    """Un problema en una fila. `field` es `None` cuando el problema es de la fila entera."""

    row_index: int
    message: str
    field: str | None = None


def validate_import_row(
    index: int, row: ImportRowInput
) -> tuple[ValidatedImportRow | None, ImportRowIssue | None]:
    """`(fila_válida, None)` o `(None, problema)`. Nunca las dos cosas."""
    name = (row.name or "").strip()
    if not name:
        return None, ImportRowIssue(index, "El nombre es obligatorio.", "name")

    measure = (row.size_measure or "").strip().lower()
    if measure not in VALID_MEASURES:
        return None, ImportRowIssue(
            index,
            f"Unidad inválida: '{row.size_measure}'. Debe ser {' | '.join(VALID_MEASURES)}.",
            "size_measure",
        )

    try:
        amount = Decimal(str(row.size_amount).strip())
    except (InvalidOperation, ValueError, TypeError):
        return None, ImportRowIssue(
            index, f"Cantidad inválida: '{row.size_amount}'. Debe ser un número.", "size_amount"
        )
    if amount <= 0:
        return None, ImportRowIssue(
            index, "La cantidad debe ser mayor que cero.", "size_amount"
        )

    return (
        ValidatedImportRow(
            row_index=index,
            name=name,
            brand=normalize_brand(row.brand),
            size_amount=amount,
            size_measure=measure,
            display_size=(row.display_size or "").strip() or None,
            quality=(row.quality or "").strip() or None,
            image_url=(row.image_url or "").strip() or None,
            category=(row.category or "").strip() or None,
        ),
        None,
    )


def find_intra_file_duplicates(rows: list[ValidatedImportRow]) -> list[ImportRowIssue]:
    """Filas repetidas DENTRO del mismo archivo — se avisa en la SEGUNDA aparición.

    Es un warning, no un error: el operador puede tener una razón. Pero enterarse después de
    crear dos canónicos significa mergearlos a mano, y el merge está fuera de alcance.
    """
    seen: set[tuple[str, str, str, str]] = set()
    warnings: list[ImportRowIssue] = []
    for row in rows:
        key = row.dedup_key
        if key in seen:
            warnings.append(
                ImportRowIssue(
                    row.row_index,
                    f"Duplicado dentro del archivo: '{row.name}' ya aparece en una fila anterior.",
                )
            )
        seen.add(key)
    return warnings


@dataclass(frozen=True, slots=True)
class ImportPreview:
    """Resultado del paso 2 (previsualizar). Nada persistido todavía."""

    valid_rows: list[ValidatedImportRow]
    invalid_rows: list[ImportRowIssue]
    warnings: list[ImportRowIssue]

    @property
    def valid_count(self) -> int:
        return len(self.valid_rows)

    @property
    def invalid_count(self) -> int:
        return len(self.invalid_rows)
