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


def test_rejects_anything_that_is_not_a_well_formed_barcode() -> None:
    # OJO: este test antes se llamaba "rechaza lo que no tenga 13 dígitos" y listaba `123456789012`
    # como basura. Esa premisa era FALSA y encodeaba el bug: 12 dígitos = UPC-A, y ese en particular
    # tiene checksum válido → es un barcode legítimo. Los largos que NO son ni EAN-13 ni UPC-A sí se
    # rechazan (son PLU / ids internos), igual que lo no numérico.
    for code in ("33334", "16095", "1234567890", "12345678901234", "", "746008378014X", "  "):
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


# ── UPC-A: el bug que la corrida E2E destapó (2026-07-15) ─────────────────────────────────────
# `is_valid_ean13` exigía 13 dígitos y descartaba en SILENCIO todo UPC-A (12 dígitos), el código
# norteamericano — abundante en un súper dominicano lleno de importados. Síntoma: Loop B encontró 10
# productos de Bravo PREGUNTANDO por su barcode, y la cosecha después decía que 8 "no tenían EAN".
# Imposible por construcción: si `filterByEan` los halló, tienen ese código. Tirando de ese hilo:
# `760593023182` (12 díg) es un UPC-A válido → como EAN-13 es `0760593023182`, checksum OK, prefijo
# 076 = USA/Canadá. En mi propio spike los había contado como basura ("no-EAN13 (12 díg.): 22").
#
# NORMALIZAR no es cosmética: si Bravo dice `760593023182` y Sirena dice `0760593023182`, son el
# MISMO producto. Sin normalizar, la etapa EAN nunca los enlaza — el bug se vuelve invisible y se
# manifiesta como "no matchea", que es lo peor: un falso negativo silencioso.


def test_accepts_upc_a_normalising_it_to_ean13() -> None:
    # UPC-A de 12 dígitos ≡ EAN-13 con un 0 adelante (regla GS1).
    assert pick_global_ean(["760593023182"]) == "0760593023182"


def test_upc_a_and_its_ean13_form_are_the_same_barcode() -> None:
    # LA prueba de por qué se normaliza: dos tiendas pueden escribir el mismo código distinto.
    # Si no convergen a la misma cadena, la etapa EAN no los enlaza y el producto se duplica.
    assert pick_global_ean(["760593023182"]) == pick_global_ean(["0760593023182"])


def test_rejects_upc_a_reserved_for_in_store_use() -> None:
    # Número de sistema 2 = peso variable (el barcode codifica el peso, no el producto); 4 = uso
    # local. Normalizados quedan `02…` / `04…` → caen en los rangos GS1 020-029 / 040-049, que el
    # filtro de "2x" NO cubría. Arreglar solo lo de 12 dígitos habría COLADO estos.
    assert is_global_ean("020123456789") is False  # sistema 2 → peso variable
    assert is_global_ean("040123456784") is False  # sistema 4 → uso local


def test_rejects_upc_a_with_a_broken_checksum() -> None:
    assert is_global_ean("760593023183") is False  # último dígito cambiado


def test_still_rejects_the_ean13_internal_range() -> None:
    # No se rompe lo que ya andaba: 200-299 sigue fuera.
    assert is_global_ean("2050001175465") is False
