"""Barcodes (familia GTIN) — qué código identifica un producto ENTRE tiendas, y en qué forma. PURO (ADR 31).

El barcode es el único identificador de un producto que NO depende de la base de datos de la tienda:
por eso la etapa EAN de la cascada auto-enlaza con score 1.0, sin juez ni revisión humana. Justamente
por eso, lo que entra acá tiene que ser irreprochable — un false merge en esa etapa corrompe toda
comparación construida encima y NADIE lo revisa, porque fue automático (regla SAGRADA del matching).

Dos responsabilidades, y las dos son necesarias:

1. **NORMALIZAR** — la misma unidad de consumo se escribe de formas distintas según el país y la
   tienda. Si Bravo escribe `760593023182` y Sirena `0760593023182` y no convergen a la misma cadena,
   la etapa EAN nunca los enlaza: el producto se duplica y el bug es INVISIBLE (se manifiesta como
   "no matchea", un falso negativo silencioso).

2. **FILTRAR** — de forma ESTRICTA y asimétrica: ante la duda NO hay barcode, y la cascada sigue por
   nombre/vector → juez → cola, que sí tiene red de contención humana. Descartar un código bueno
   cuesta un match más caro; aceptar uno malo mete un dato corrupto y silencioso.

## La familia GTIN (alcance GLOBAL, decisión 2026-07-16)

La app arranca en RD pero se extiende a USA, Europa y LatAm, así que el dominio habla la familia
COMPLETA — no "EAN-13 con un parche para UPC-A":

| Formato | Díg. | Dónde |
|---|---|---|
| GTIN-8  | 8  | EAN-8, productos chicos |
| UPC-E   | 8  | UPC-A comprimido (supresión de ceros) — USA |
| GTIN-12 | 12 | UPC-A — USA/Canadá |
| GTIN-13 | 13 | EAN-13 — Europa/LatAm/RD |
| GTIN-14 | 14 | código de caja/logística (dígito indicador 1-8) |

**Forma canónica de salida: GTIN-14 con ceros a la izquierda** (regla GS1: right-align + zero-pad).
El check digit se preserva por construcción: los pesos 3,1,3,1… se cuentan DESDE el verificador hacia
la izquierda, así que los ceros de relleno no alteran la suma ponderada. Las cuatro escrituras
posibles del mismo producto convergen a UNA sola cadena y la etapa EAN compara strings.

Un GTIN-14 con dígito indicador 1-8 es una CAJA de N unidades: otro SKU, con su propio check digit.
Queda como cadena distinta del unitario, que es lo correcto — una caja no se compara con un pote.

## Dos trampas que ya se pagaron

- **UPC-E vs GTIN-8 son ambiguos por largo** (los dos tienen 8 dígitos). Se distinguen por el número
  de sistema (UPC-E exige 0 ó 1) y el UPC-E se valida EXPANDIÉNDOLO: su check digit es el del UPC-A
  expandido, no uno propio de los 8 dígitos.
- **El filtro corre sobre la forma CRUDA, nunca sobre la ya normalizada.** Un GTIN-8 interno
  (`21061684`, prefijo 2) padeado a GTIN-14 queda `00000021061684`, indistinguible de un UPC-A cuyo
  prefijo NO es interno: re-filtrar un valor ya almacenado lo daría por global. Por eso el filtro
  vive en el BORDE de escritura (`pick_global_ean`), decide con el formato todavía a la vista, y lo
  que se guarda ya viene filtrado. `is_global_ean` espera entrada CRUDA de la tienda.
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

_GTIN14 = 14
_GTIN13 = 13
_GTIN12 = 12  # UPC-A
_GTIN8 = 8
# No existe ningún barcode de 11 dígitos. La única lectura sana es un UPC-A cuyo cero inicial se comió
# un parseo NUMÉRICO aguas arriba (un JSON que manda el código como número, no como string). Medido en
# Sirena 2026-07-16: 11 filas, 11/11 pasaban checksum al restaurar el cero (azar = 10⁻¹¹) y el prefijo
# cuadraba con la marca del nombre (41331 = Goya en "Guandules Verdes Goya"). El checksum sigue siendo
# la red: filtra 9 de cada 10 SKUs de 11 dígitos que se colaran en el campo.
_UPCA_ZERO_STRIPPED = 11

# GS1 reserva estos prefijos a "restricted distribution": códigos que la tienda se asigna a sí misma.
# En supermercados son, sobre todo, artículos de PESO VARIABLE (fiambre, frutas, panadería) donde el
# barcode codifica el PESO o el PRECIO de ESE paquete — no el producto. Dos paquetes del mismo queso
# tienen códigos distintos, y ninguno existe en otra cadena.
#
# Sobre el prefijo de 3 dígitos de la vista GTIN-13:
#   200-299 → restricted (EAN-13 nativo)
#   020-029 → UPC-A con número de sistema 2 (peso variable) + el 0 de la conversión
#   040-049 → UPC-A con número de sistema 4 (uso local / fidelidad)
# Los dos últimos son la trampa: un filtro que solo mire "2x" los deja pasar disfrazados de `0…`.
#
#   980-984 → cupones y recibos de reembolso GS1
#   990-999 → cupones
# No son productos: no hay nada que comparar entre tiendas. Hoy en RD no aparecen, pero el día que
# entremos a USA/Europa sí — y auto-enlazarían a 1.0 sin que nadie los revise.
#
# NO se rechazan 977 (ISSN, revistas) ni 978/979 (ISBN/ISMN, libros): son identificadores GLOBALES de
# productos que un súper SÍ vende y que SÍ cruzan entre tiendas — justo lo que la etapa EAN necesita.
_RESTRICTED_PREFIXES = ((200, 299), (20, 29), (40, 49), (980, 984), (990, 999))

# GS1 reserva a circulación restringida los GTIN-8 que empiezan en 0 ó 2.
_RESTRICTED_GTIN8_LEADS = ("0", "2")

# UPC-E solo existe con número de sistema 0 ó 1 — así se desambigua de un GTIN-8.
_UPCE_NUMBER_SYSTEMS = ("0", "1")


@dataclass(frozen=True, slots=True)
class _Gtin:
    """Un GTIN ya parseado: su forma canónica y si sirve cross-tienda.

    Las dos cosas se resuelven JUNTAS, mientras el formato de origen todavía se conoce — después de
    padear a GTIN-14 la información de formato se pierde (ver la segunda trampa en el módulo).
    """

    gtin14: str
    restricted: bool


def _checksum_ok(gtin: str) -> bool:
    """Dígito verificador GS1 mod-10, para CUALQUIER largo de GTIN.

    Los pesos alternan 3 y 1 contando desde el dígito PREVIO al verificador hacia la izquierda; el
    verificador es lo que falta para llegar a la decena. Contarlos desde la derecha (y no desde la
    izquierda, como suele escribirse para EAN-13) es lo que hace que la misma función valide 8, 12,
    13 y 14 dígitos — y también lo que hace que rellenar ceros a la izquierda no rompa nada.
    """
    body = [int(c) for c in gtin[-2::-1]]
    total = sum(d * (3 if i % 2 == 0 else 1) for i, d in enumerate(body))
    return (10 - total % 10) % 10 == int(gtin[-1])


def _expand_upc_e(code: str) -> str | None:
    """UPC-E (8 díg.) → su UPC-A (12 díg.), o `None` si no es un UPC-E.

    La supresión de ceros del UPC-E no es reversible "a ojo": el ÚLTIMO dígito del payload dice
    dónde volvían los ceros. El check digit del UPC-E es el del UPC-A expandido, así que la
    validación ocurre después, sobre los 12.
    """
    if code[0] not in _UPCE_NUMBER_SYSTEMS:
        return None
    ns, payload, check = code[0], code[1:7], code[7]
    last = payload[5]
    if last in "012":
        body = ns + payload[0:2] + last + "0000" + payload[2:5]
    elif last == "3":
        body = ns + payload[0:3] + "00000" + payload[3:5]
    elif last == "4":
        body = ns + payload[0:4] + "00000" + payload[4]
    else:
        body = ns + payload[0:5] + "0000" + last
    return body + check


def _restricted_prefix(gtin13_view: str) -> bool:
    return any(lo <= int(gtin13_view[:3]) <= hi for lo, hi in _RESTRICTED_PREFIXES)


def _parse(code: str) -> _Gtin | None:
    """El corazón: valida el formato y resuelve (forma canónica, restringido) de una sola vez."""
    if not code.isdigit():
        return None

    if len(code) == _GTIN8:
        # Ambiguo: UPC-E o GTIN-8. El número de sistema decide, y el UPC-E se valida expandido.
        upca = _expand_upc_e(code)
        if upca is not None and _checksum_ok(upca):
            return _Gtin(upca.rjust(_GTIN14, "0"), _restricted_prefix(upca.rjust(_GTIN13, "0")))
        if not _checksum_ok(code):
            return None
        return _Gtin(code.rjust(_GTIN14, "0"), code[0] in _RESTRICTED_GTIN8_LEADS)

    if len(code) == _UPCA_ZERO_STRIPPED:
        code = "0" + code

    if len(code) not in (_GTIN12, _GTIN13, _GTIN14) or not _checksum_ok(code):
        return None

    # Vista GTIN-13 para leer el prefijo GS1: en un GTIN-14 el primer dígito es el INDICADOR de caja
    # (no parte del prefijo), en los demás se llega padeando con ceros.
    gtin13_view = code[1:] if len(code) == _GTIN14 else code.rjust(_GTIN13, "0")
    return _Gtin(code.rjust(_GTIN14, "0"), _restricted_prefix(gtin13_view))


def normalize_barcode(code: str) -> str | None:
    """Lleva el código a GTIN-14 canónico, o `None` si no es un barcode bien formado.

    Acepta toda la familia: GTIN-8, UPC-E (expandido), UPC-A de 12, UPC-A de 11 con el cero comido,
    GTIN-13 y GTIN-14. Cualquier otro largo es un PLU o un id interno, no un barcode. El checksum se
    valida SIEMPRE. No dice nada sobre si el código sirve cross-tienda — para eso, `is_global_ean`.
    """
    parsed = _parse(code)
    return parsed.gtin14 if parsed else None


def is_valid_ean13(code: str) -> bool:
    """¿Es un barcode bien formado? No dice nada sobre si sirve cross-tienda."""
    return _parse(code) is not None


def is_global_ean(code: str) -> bool:
    """¿Este barcode identifica al producto en CUALQUIER tienda? Exige las dos cosas: bien formado Y
    fuera de los rangos restringidos. Un `2050001175465` cumple lo primero pero no lo segundo.

    Espera la forma CRUDA que publicó la tienda: un GTIN-8 interno ya normalizado a GTIN-14 es
    indistinguible de un UPC-A global (ver la segunda trampa en el módulo).
    """
    parsed = _parse(code)
    return parsed is not None and not parsed.restricted


def pick_global_ean(codes: Iterable[object]) -> str | None:
    """El primer barcode GLOBAL de una lista mezclada, NORMALIZADO a GTIN-14. `None` si no hay ninguno.

    Existe porque hay APIs que devuelven TODOS los códigos de un artículo juntos: Bravo (`/get` →
    `associatedEan`) mezcla globales, internos, UPC-A y PLU cortos, y el global NO viene primero.
    Tomar `[0]` metería un código interno en la etapa que auto-enlaza.

    Este es EL borde de escritura: filtra con el formato todavía a la vista y devuelve ya normalizado,
    de modo que lo almacenado nunca necesite re-filtrarse. Todo adapter debe pasar por acá.

    Devolver `None` es un resultado esperado y sano: sin barcode confiable la cascada sigue por
    nombre/vector, que es más caro pero tiene revisión humana.
    """
    for raw in codes:
        if raw is None:
            continue
        parsed = _parse(str(raw).strip())
        if parsed is not None and not parsed.restricted:
            return parsed.gtin14
    return None
