"""Unit — validación PURA de la importación masiva de canónicos (F5, US-CP-L8).

El SDD manda tres pasos: cargar → PREVISUALIZAR → confirmar. La previsualización tiene que poder
decirle al operador exactamente qué fila está mal y por qué ANTES de tocar la base — eso es
lógica de validación, y se prueba sin DB.
"""
from __future__ import annotations

from decimal import Decimal

from src.contexts.save.domain.canonical_import import (
    ImportRowInput,
    find_intra_file_duplicates,
    normalize_brand,
    validate_import_row,
)


def _row(**overrides):  # type: ignore[no-untyped-def]
    base = {
        "name": "Arroz Blanco",
        "brand": "goya",
        "size_amount": "5",
        "size_measure": "mass",
        "display_size": "5 Lb",
        "quality": "standard",
        "image_url": None,
        "category": None,
    }
    base.update(overrides)
    return ImportRowInput(**base)  # type: ignore[arg-type]


class TestNormalizeBrand:
    """US-CP-L7: la marca se persiste en MAYÚSCULA. Sin esto vuelven `goya`, `Goya` y `GOYA`
    como tres marcas distintas — exactamente lo que la tabla `save.brand` vino a evitar."""

    def test_lowercase_becomes_uppercase(self) -> None:
        assert normalize_brand("goya") == "GOYA"

    def test_mixed_case_becomes_uppercase(self) -> None:
        assert normalize_brand("La Famosa") == "LA FAMOSA"

    def test_surrounding_whitespace_is_trimmed(self) -> None:
        assert normalize_brand("  goya  ") == "GOYA"

    def test_none_becomes_empty_string(self) -> None:
        assert normalize_brand(None) == ""


class TestValidateImportRow:
    def test_a_valid_row_is_accepted_and_normalized(self) -> None:
        ok, issue = validate_import_row(0, _row())
        assert issue is None
        assert ok is not None
        assert ok.name == "Arroz Blanco"
        assert ok.brand == "GOYA"
        assert ok.size_amount == Decimal("5")
        assert ok.size_measure == "mass"

    def test_a_missing_name_is_rejected(self) -> None:
        ok, issue = validate_import_row(3, _row(name="   "))
        assert ok is None
        assert issue is not None
        assert issue.row_index == 3
        assert issue.field == "name"

    def test_an_invalid_measure_is_rejected_naming_the_field(self) -> None:
        ok, issue = validate_import_row(1, _row(size_measure="kilos"))
        assert ok is None
        assert issue is not None
        assert issue.field == "size_measure"
        assert "kilos" in issue.message

    def test_a_non_numeric_amount_is_rejected(self) -> None:
        ok, issue = validate_import_row(2, _row(size_amount="cinco"))
        assert ok is None
        assert issue is not None
        assert issue.field == "size_amount"

    def test_a_zero_amount_is_rejected(self) -> None:
        """`size_amount` es NOT NULL en el modelo y un tamaño de 0 no representa nada real."""
        ok, issue = validate_import_row(0, _row(size_amount="0"))
        assert ok is None
        assert issue is not None
        assert issue.field == "size_amount"

    def test_a_negative_amount_is_rejected(self) -> None:
        ok, issue = validate_import_row(0, _row(size_amount="-3"))
        assert ok is None
        assert issue is not None

    def test_an_absent_brand_is_allowed(self) -> None:
        """La marca es opcional: hay productos genéricos sin marca real. No inventamos una."""
        ok, issue = validate_import_row(0, _row(brand=None))
        assert issue is None
        assert ok is not None
        assert ok.brand == ""


class TestFindIntraFileDuplicates:
    """Duplicados DENTRO del mismo archivo. Si el CSV trae la misma fila dos veces, avisamos
    ANTES de crear dos canónicos que después habrá que mergear a mano."""

    def test_two_identical_rows_produce_a_warning_on_the_second(self) -> None:
        rows = [
            validate_import_row(0, _row())[0],
            validate_import_row(1, _row())[0],
        ]
        warnings = find_intra_file_duplicates([r for r in rows if r is not None])
        assert len(warnings) == 1
        assert warnings[0].row_index == 1

    def test_rows_differing_only_in_case_are_still_duplicates(self) -> None:
        rows = [
            validate_import_row(0, _row(name="Arroz Blanco"))[0],
            validate_import_row(1, _row(name="ARROZ BLANCO"))[0],
        ]
        warnings = find_intra_file_duplicates([r for r in rows if r is not None])
        assert len(warnings) == 1

    def test_different_sizes_are_not_duplicates(self) -> None:
        """Mismo producto en otro tamaño es OTRO canónico — es el caso de los gandules 15 oz
        contra los de 820 gr. Marcarlos como duplicado empujaría a un falso merge."""
        rows = [
            validate_import_row(0, _row(size_amount="5"))[0],
            validate_import_row(1, _row(size_amount="10"))[0],
        ]
        warnings = find_intra_file_duplicates([r for r in rows if r is not None])
        assert warnings == []

    def test_no_duplicates_produces_no_warnings(self) -> None:
        rows = [
            validate_import_row(0, _row(name="Arroz"))[0],
            validate_import_row(1, _row(name="Habichuela"))[0],
        ]
        warnings = find_intra_file_duplicates([r for r in rows if r is not None])
        assert warnings == []


class TestNormalizeAmountKey:
    """`size_amount` es `Numeric(18,8)`: la base devuelve `1.00000000` donde el CSV trae `1`.
    Sin normalizar los dos lados, un duplicado REAL pasa desapercibido en el preview."""

    def test_trailing_zeros_do_not_change_the_key(self) -> None:
        from src.contexts.save.domain.canonical_import import normalize_amount_key

        assert normalize_amount_key(Decimal("1.00000000")) == normalize_amount_key("1")

    def test_a_round_hundred_is_not_rendered_in_scientific_notation(self) -> None:
        """`Decimal('100').normalize()` da `1E+2` — si se colara, `100` y `100.0` dejarían de
        parecer el mismo tamaño."""
        from src.contexts.save.domain.canonical_import import normalize_amount_key

        assert normalize_amount_key(Decimal("100")) == "100"
        assert normalize_amount_key(Decimal("100.00")) == "100"

    def test_decimals_are_preserved(self) -> None:
        from src.contexts.save.domain.canonical_import import normalize_amount_key

        assert normalize_amount_key(Decimal("1.5")) == "1.5"
        assert normalize_amount_key("1.50") == "1.5"

    def test_garbage_falls_back_to_the_raw_string(self) -> None:
        from src.contexts.save.domain.canonical_import import normalize_amount_key

        assert normalize_amount_key("cinco") == "cinco"
