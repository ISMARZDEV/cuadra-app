"""Unit — EAN: qué barcode sirve para identificar un producto ENTRE tiendas. PURO, sin red ni DB.

Por qué esto existe: el detalle de Bravo (`/get`) devuelve `associatedEan` como una LISTA que MEZCLA
tres cosas (sondeo en vivo 2026-07-15, 100 artículos con checksum GS1 validado):

  · 108 códigos EAN-13 con prefijo 2x → "restricted distribution": barcode INTERNO de la tienda. En
    supermercados suelen ser artículos de PESO VARIABLE (fiambre, frutas) donde el código codifica el
    peso o el precio, NO el producto. Solo existen dentro de esa cadena.
  ·  24 códigos EAN-13 GLOBALES (prefijo 746 = Rep. Dominicana, y algunos importados).
  ·  el resto, códigos de 3/5/6/8/11/12 dígitos → PLU internos, ni siquiera son EAN.

Tomar `associatedEan[0]` a ciegas metería basura en la etapa EAN de la cascada, que es la que
AUTO-ENLAZA sin revisión humana (score 1.0). Un false merge ahí corrompe toda comparación construida
encima y nadie lo revisa, porque fue automático. De ahí que el filtro sea deliberadamente estricto:
ante la duda, NO hay EAN — la cascada seguirá por nombre/vector, que sí tiene red de contención.
"""
from __future__ import annotations

from src.contexts.save.domain.value_objects import is_global_ean, pick_global_ean


def test_accepts_a_valid_global_ean13() -> None:
    # 7460083780146 — prefijo 746 (Rep. Dominicana), checksum GS1 válido. Este SÍ identifica el
    # producto entre tiendas: el mismo número está en Sirena.
    assert is_global_ean("7460083780146") is True


def test_rejects_store_internal_codes_even_when_the_checksum_is_valid() -> None:
    # Prefijos 20-29 = restricted distribution. Es un EAN-13 perfectamente formado, pero solo
    # significa algo dentro de esa cadena → inútil (y peligroso) para matchear entre tiendas.
    assert is_global_ean("2050001175465") is False


def test_rejects_codes_with_a_broken_checksum() -> None:
    # Mismo código que el válido con el último dígito cambiado → el mod-10 no cierra.
    assert is_global_ean("7460083780145") is False


def test_rejects_anything_that_is_not_13_digits() -> None:
    for code in ("33334", "16095", "123456789012", "", "746008378014X", "  "):
        assert is_global_ean(code) is False, code


def test_picks_the_global_ean_out_of_bravos_mixed_bag() -> None:
    # El caso REAL de "LA GARZA ARROZ 10 LB": un PLU corto primero, después el global.
    assert pick_global_ean(["33334", "7460083780146"]) == "7460083780146"


def test_ignores_position_and_never_returns_an_internal_code() -> None:
    # El interno viene PRIMERO. `[0]` habría devuelto basura.
    assert pick_global_ean(["2050001175465", "7460083780146"]) == "7460083780146"


def test_returns_none_when_only_internal_or_junk_codes_are_present() -> None:
    # El 70% de Bravo cae acá → sin EAN, y la cascada sigue por nombre/vector. Es el resultado
    # CORRECTO: mejor sin barcode que con uno que miente.
    assert pick_global_ean(["2050001175465", "33334", ""]) is None
    assert pick_global_ean([]) is None


def test_prefers_the_first_global_when_a_product_carries_several() -> None:
    assert pick_global_ean(["7460083780146", "5410041000018"]) == "7460083780146"


def test_tolerates_whitespace_and_non_string_input() -> None:
    # Los payloads reales traen los códigos como str, pero un JSON podría mandar números.
    assert pick_global_ean(["  7460083780146  "]) == "7460083780146"
    assert pick_global_ean([None, 7460083780146]) == "7460083780146"  # type: ignore[list-item]
