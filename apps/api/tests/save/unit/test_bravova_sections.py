"""Unit — mapa `subfamilia → sección` de Bravo (PURO, sin red ni BD).

El módulo es GENERADO por `seeds/build_bravo_section_map.py`, así que estos tests no verifican
entradas concretas —cambiarían en cada regeneración— sino los INVARIANTES que hacen que el mapa sea
seguro de usar: que no tenga basura, que sus valores sean secciones plausibles, y sobre todo que
`section_for_subfamily` devuelva `None` en vez de inventar cuando no sabe.

Por qué importa el `None`: el mapa alimenta la categoría de ORIGEN, que el clasificador cruza con el
nombre. Una sección inventada no produce una abstención — produce una clasificación CONVENCIDA y
equivocada, que es el modo de falla que este módulo entero existe para evitar.
"""
from __future__ import annotations

from src.contexts.save.infrastructure.catalog_sources.bravova_sections import (
    SUBFAMILY_SECTIONS,
    section_for_subfamily,
)


def test_the_map_is_not_empty() -> None:
    # Un mapa vacío sería el síntoma de una regeneración fallida (Bravo caído, token vencido) que
    # de otro modo pasaría inadvertida: todo seguiría "funcionando", sólo que sin señal de origen.
    assert len(SUBFAMILY_SECTIONS) > 100


def test_no_blank_keys_or_values() -> None:
    for code, section in SUBFAMILY_SECTIONS.items():
        assert code.strip() == code and code, f"código con espacios o vacío: {code!r}"
        assert section.strip() == section and section, f"sección con espacios o vacía: {section!r}"


def test_keys_look_like_bravo_subfamily_codes() -> None:
    # Formato observado en el API: `GR-003`, `PC-125`. Si aparece otra cosa, el parseo de la
    # subfamilia cambió y el mapa dejó de alinear con lo que guarda `source_category`.
    import re

    patron = re.compile(r"^[A-Z]{2,3}-[0-9]+$")
    malos = [c for c in SUBFAMILY_SECTIONS if not patron.match(c)]
    assert not malos, f"claves con formato inesperado: {malos[:5]}"


def test_generic_sections_are_never_a_mapped_value() -> None:
    """Las secciones TRANSVERSALES se excluyen al construir el mapa: un producto vive en la suya Y
    en «Alimentación general», así que mapear a la genérica no aporta señal —«Alimentación general»
    no pega ningún token del léxico— y encima taparía la buena."""
    from seeds.build_bravo_section_map import GENERIC_SECTIONS

    filtradas = {c: s for c, s in SUBFAMILY_SECTIONS.items() if s in GENERIC_SECTIONS}
    assert not filtradas, f"el mapa apunta a secciones genéricas: {list(filtradas)[:5]}"


def test_an_unknown_code_returns_none_instead_of_guessing() -> None:
    assert section_for_subfamily("ZZ-999") is None
    assert section_for_subfamily("") is None
    assert section_for_subfamily("   ") is None


def test_lookup_tolerates_surrounding_whitespace() -> None:
    # El código llega del JSON del proveedor; un espacio de más no puede costar la señal de origen.
    code = next(iter(SUBFAMILY_SECTIONS))
    assert section_for_subfamily(f"  {code} ") == SUBFAMILY_SECTIONS[code]
