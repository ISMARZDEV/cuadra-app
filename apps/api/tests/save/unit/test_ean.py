"""Unit — GTIN: qué código identifica un producto ENTRE tiendas, y en qué forma. PURO, sin red ni DB.

Por qué esto existe: el detalle de Bravo (`/get`) devuelve `associatedEan` como una LISTA que MEZCLA
tres cosas (sondeo en vivo 2026-07-15, 100 artículos con checksum GS1 validado):

  · 108 códigos con prefijo 2x → "restricted distribution": barcode INTERNO de la tienda. En
    supermercados suelen ser artículos de PESO VARIABLE (fiambre, frutas) donde el código codifica el
    peso o el precio, NO el producto. Solo existen dentro de esa cadena.
  ·  24 códigos GLOBALES (prefijo 746 = Rep. Dominicana, y algunos importados).
  ·  el resto, códigos de 3/5/6 dígitos → PLU internos, ni siquiera son GTIN.

Tomar `associatedEan[0]` a ciegas metería basura en la etapa EAN de la cascada, que es la que
AUTO-ENLAZA sin revisión humana (score 1.0). Un false merge ahí corrompe toda comparación construida
encima y nadie lo revisa, porque fue automático. De ahí que el filtro sea deliberadamente estricto:
ante la duda, NO hay GTIN — la cascada seguirá por nombre/vector, que sí tiene red de contención.

ALCANCE GLOBAL (decisión 2026-07-16): la app arranca en RD pero se extiende a USA, Europa y LatAm.
Por eso el dominio habla la familia GTIN COMPLETA, no "EAN-13 + un parche para UPC-A":

  GTIN-8  (8 díg.)   EAN-8 — productos chicos
  UPC-E   (8 díg.)   UPC-A comprimido (supresión de ceros) — USA. AMBIGUO con GTIN-8 por largo:
                     se distingue por el número de sistema (0 ó 1) y se valida EXPANDIÉNDOLO.
  GTIN-12 (12 díg.)  UPC-A — USA/Canadá
  GTIN-13 (13 díg.)  EAN-13 — Europa/LatAm/RD
  GTIN-14 (14 díg.)  código de caja/logística (dígito indicador 1-8)

La forma canónica de almacenamiento es **GTIN-14 con ceros a la izquierda** (regla GS1: right-align +
zero-pad). El check digit se preserva por construcción, porque los pesos 3,1,3,1… se cuentan DESDE el
verificador hacia la izquierda — los ceros de relleno no alteran la suma ponderada. Así las cuatro
escrituras posibles del mismo producto convergen a UNA sola cadena y la etapa EAN compara strings.
"""
from __future__ import annotations

from src.contexts.save.domain.value_objects import is_global_ean, normalize_barcode, pick_global_ean

# ── Normalización: toda la familia GTIN converge a GTIN-14 ────────────────────────────────────


def test_normalises_ean13_to_gtin14() -> None:
    # 7460083780146 — prefijo 746 (Rep. Dominicana), checksum GS1 válido.
    assert normalize_barcode("7460083780146") == "07460083780146"


def test_normalises_upc_a_to_gtin14() -> None:
    # UPC-A (USA/Canadá): 12 dígitos. El caso que destapó la corrida E2E de 2026-07-15.
    assert normalize_barcode("760593023182") == "00760593023182"


def test_normalises_gtin8_to_gtin14() -> None:
    # EAN-8 padeado a 14. NO es cosmético ni un invento: es la regla GS1 (right-align + zero-pad),
    # y el checksum sigue cerrando porque los pesos se cuentan desde el verificador.
    assert normalize_barcode("40170725") == "00000040170725"


def test_accepts_gtin14_as_is() -> None:
    # Un código de caja ya viene en la forma canónica.
    assert normalize_barcode("07460083780146") == "07460083780146"


def test_all_written_forms_of_the_same_product_converge_to_one_string() -> None:
    # LA razón de ser de la normalización: dos tiendas pueden escribir el MISMO código distinto.
    # Si no convergen a la misma cadena, la etapa EAN nunca los enlaza — el producto se duplica y
    # el bug es INVISIBLE (se manifiesta como "no matchea", un falso negativo silencioso).
    formas = ("760593023182", "0760593023182", "00760593023182")
    assert len({normalize_barcode(f) for f in formas}) == 1


# ── UPC-E: el formato comprimido de USA (8 díg., ambiguo con GTIN-8) ──────────────────────────


def test_expands_upc_e_to_its_upc_a_and_then_to_gtin14() -> None:
    # 01234565 es el ejemplo canónico de la especificación: expande a UPC-A 012345000065.
    # OJO: el check digit de un UPC-E es el de su UPC-A EXPANDIDO, no uno propio de los 8 dígitos.
    assert normalize_barcode("01234565") == "00012345000065"


def test_expands_upc_e_with_number_system_one() -> None:
    assert normalize_barcode("11234562") == "00112345000062"


def test_upc_e_and_its_expanded_upc_a_are_the_same_product() -> None:
    # Una tienda puede publicar el comprimido y otra el expandido: deben converger.
    assert normalize_barcode("01234565") == normalize_barcode("012345000065")


def test_eight_digits_starting_with_2_is_a_gtin8_not_a_upc_e() -> None:
    # Desambiguación por número de sistema: UPC-E exige 0 ó 1. `21061684` (caso REAL de Sirena,
    # "Arroz Super Selecto Bisono") es un GTIN-8 válido, no un UPC-E.
    assert normalize_barcode("21061684") == "00000021061684"


# ── El cero comido: UPC-A de 11 dígitos (bug REAL de Sirena, medido 2026-07-16) ───────────────


def test_rescues_upc_a_that_lost_its_leading_zero() -> None:
    # 11 filas de Sirena tenían 11 dígitos. No existe ningún barcode de 11: la única lectura sana
    # es un UPC-A cuyo cero inicial se comió un parseo numérico aguas arriba. La evidencia fue
    # concluyente: 11/11 pasaban checksum al restaurar el cero (azar = 10⁻¹¹) Y el prefijo cuadraba
    # con la marca del nombre — 41331 = Goya en "Guandules Verdes Goya".
    assert normalize_barcode("41331026123") == "00041331026123"


def test_the_zero_stripped_form_matches_the_intact_one() -> None:
    # El punto: recupera 11 barcodes del SEMBRADOR (Sirena, 100% EAN) — justo lo que hace efectivo
    # el Proceso 2 (job por EAN de Bravo) sobre esos canónicos.
    assert normalize_barcode("41331026123") == normalize_barcode("041331026123")


def test_an_eleven_digit_code_with_a_broken_checksum_is_still_rejected() -> None:
    # El rescate NO es "padear a lo que sea": el checksum filtra 9 de cada 10 SKUs de 11 dígitos
    # que se colaran en el campo.
    assert normalize_barcode("41331026124") is None


# ── Filtro: qué GTIN sirve cross-tienda ───────────────────────────────────────────────────────


def test_accepts_a_valid_global_gtin13() -> None:
    assert is_global_ean("7460083780146") is True


def test_rejects_store_internal_codes_even_when_the_checksum_is_valid() -> None:
    # Prefijos 20-29 = restricted distribution. Perfectamente formado, pero solo significa algo
    # dentro de esa cadena → inútil (y peligroso) para matchear entre tiendas.
    assert is_global_ean("2050001175465") is False


def test_rejects_upc_a_reserved_for_in_store_use() -> None:
    # Número de sistema 2 = peso variable (el barcode codifica el peso, no el producto); 4 = uso
    # local. Normalizados quedan `020…` / `040…` → rangos GS1 020-029 / 040-049, que un filtro que
    # solo mire "2x" NO cubre: se colarían disfrazados de `0…`.
    #
    # ⚠️ Los fixtures de este test eran `020123456789` / `040123456784`, y AMBOS tenían el checksum
    # ROTO: se rechazaban por malformados y el rango que el test dice defender nunca se evaluaba.
    # Pasaba en verde defendiendo NADA (verificado 2026-07-16). El filtro sí estaba bien; el test
    # mentía — la misma forma de bug que la ingesta ya pagó cinco veces.
    assert is_global_ean("201234567899") is False  # sistema 2 → peso variable
    assert is_global_ean("401234567893") is False  # sistema 4 → uso local


def test_rejects_gtin8_reserved_for_in_store_use() -> None:
    # GS1 reserva los GTIN-8 que empiezan en 0 ó 2 a circulación restringida. `21061684` es el caso
    # REAL de Sirena: un código interno viviendo en la columna `ean`, donde auto-enlazaría a 1.0
    # sin que nadie lo revise.
    assert is_global_ean("21061684") is False


def test_accepts_a_global_gtin8() -> None:
    # El día que aparezca un GTIN-8 global (prefijo 4 aquí) lo tomamos, en vez de tirarlo.
    assert is_global_ean("40170725") is True


def test_rejects_coupons_and_refund_receipts() -> None:
    # 980-984 = cupones GS1, 99 = cupones. No son productos: nada que comparar entre tiendas.
    assert is_global_ean("9912345678909") is False


def test_accepts_isbn_and_issn_because_they_are_global_product_identifiers() -> None:
    # Libros (978/979) y revistas (977) SÍ se venden en un súper y SÍ cruzan entre tiendas —
    # que es exactamente lo que la etapa EAN necesita. 9780306406157 = ISBN-13 de referencia.
    assert is_global_ean("9780306406157") is True
    assert is_global_ean("9770123450051") is True


def test_rejects_codes_with_a_broken_checksum() -> None:
    assert is_global_ean("7460083780145") is False  # último dígito cambiado
    assert is_global_ean("760593023183") is False  # UPC-A con checksum roto


def test_rejects_anything_that_is_not_a_well_formed_gtin() -> None:
    # Largos que no son ningún GTIN (PLU / ids internos), y lo no numérico.
    for code in ("33334", "16095", "1234567890", "123456789012345", "", "746008378014X", "  "):
        assert is_global_ean(code) is False, code
        assert normalize_barcode(code) is None, code


def test_a_case_code_is_not_the_same_product_as_the_consumer_unit() -> None:
    # GTIN-14 con dígito indicador 1-8 = una CAJA de N unidades: es otro SKU, con su propio check
    # digit. Debe quedar como cadena DISTINTA del unitario — fusionarlos sería comparar una caja
    # con un pote.
    unidad = normalize_barcode("7460083780146")
    caja = normalize_barcode("17460083780143")
    assert unidad != caja


# ── pick_global_ean: el filtro en el borde de escritura ───────────────────────────────────────


def test_picks_the_global_gtin_out_of_bravos_mixed_bag() -> None:
    # El caso REAL de "LA GARZA ARROZ 10 LB": un PLU corto primero, después el global.
    assert pick_global_ean(["33334", "7460083780146"]) == "07460083780146"


def test_ignores_position_and_never_returns_an_internal_code() -> None:
    # El interno viene PRIMERO. `[0]` habría devuelto basura.
    assert pick_global_ean(["2050001175465", "7460083780146"]) == "07460083780146"


def test_returns_none_when_only_internal_or_junk_codes_are_present() -> None:
    # El 70% de Bravo cae acá → sin barcode, y la cascada sigue por nombre/vector. Es el resultado
    # CORRECTO: mejor sin barcode que con uno que miente.
    assert pick_global_ean(["2050001175465", "33334", ""]) is None
    assert pick_global_ean([]) is None


def test_prefers_the_first_global_when_a_product_carries_several() -> None:
    assert pick_global_ean(["7460083780146", "5410041000018"]) == "07460083780146"


def test_tolerates_whitespace_and_non_string_input() -> None:
    # Los payloads reales traen los códigos como str, pero un JSON podría mandar números — y ESE
    # es justamente el parseo que come el cero inicial (ver el rescate de 11 dígitos arriba).
    assert pick_global_ean(["  7460083780146  "]) == "07460083780146"
    assert pick_global_ean([None, 7460083780146]) == "07460083780146"  # type: ignore[list-item]
