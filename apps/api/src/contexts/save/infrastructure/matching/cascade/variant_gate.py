"""Variant gate de la cascada de matching (PURO).

El EAN gate (`_ean_conflicts`) cierra el falso-merge SOLO donde hay barcode. En Magento (Jumbo/
Nacional, que NO exponen EAN) un cruce de VARIANTE auto-linkeaba: dos SKUs de la misma marca+tamaño
que solo difieren en el CONTENIDO (Habichuela Pinta vs Habichuela Negra) — el boost marca+tamaño los
empuja sobre HIGH y el size_gate no dispara (los tamaños coinciden). Medido 2026-07-16: 3 casos
(pinta→negra ×2, roja→pinta).

Este gate lee la VARIANTE del NOMBRE. Contrato conservador (Sacred rule #4 — nunca empeorar hacia un
falso merge, pero tampoco romper matches buenos): devuelve `True` SOLO ante contradicción POSITIVA —
ambos nombres nombran una variante del MISMO grupo y son distintas. Si un solo lado (o ninguno)
nombra variante, o coinciden → `False` (no bloquea).

`_VARIANT_GROUPS` = grupos de valores mutuamente excluyentes que distinguen SKUs. Hoy: (1) el
color/tipo de habichuela (pinta/negra/roja/blanca/verde) y (2) la ESPECIE de legumbre
(habichuela/gandul/lenteja/garbanzo/…), que cubre el falso positivo donde el color COINCIDE y solo
la especie difiere. Extensible (tipo de arroz, con/sin coco) agregando grupos. Cada grupo mapea
forma-de-superficie → valor canónico para que ni el número gramatical ni los SINÓNIMOS cuenten como
conflicto (roja/rojas → "roja"; frijol/poroto → "habichuela"). El match es por PALABRA completa
(tokenización), nunca subcadena — "pintada" no es "pinta", "habanero" no es "haba".
"""
from __future__ import annotations

import re

_BEAN_COLOR: dict[str, str] = {
    "pinta": "pinta", "pintas": "pinta",
    "negra": "negra", "negras": "negra",
    "roja": "roja", "rojas": "roja",
    "blanca": "blanca", "blancas": "blanca",
    "verde": "verde", "verdes": "verde",
}

# Especie de legumbre. El color NO alcanza: el falso positivo medido 2026-07-21 comparte color —
# `LA FAMOSA GANDULES VERDES 15 OZ` auto-linkeó a `Habichuela Verde La Famosa 15 Oz` en 0.854 con
# misma marca, mismo tamaño y MISMO color; solo difiere la especie. trgm lo ve casi idéntico (las
# cadenas difieren en UN token) y el vector los cree vecinos (ambos legumbre enlatada), así que las
# dos etapas coinciden en equivocarse y el consenso RRF REFUERZA el error: el consenso protege del
# ruido de UNA etapa, nunca de un sesgo compartido. Por eso hace falta una señal DURA, no más score.
#
# Los SINÓNIMOS REGIONALES colapsan al mismo valor canónico a propósito: frijol/poroto/judía/alubia
# ES habichuela, y guandul ES gandul. Tratarlos como valores distintos rompería matches BUENOS (un
# empaque que dice "Frijoles Negros" contra el canónico "Habichuelas Negras" es el MISMO SKU) —
# exactamente el error inverso al que este gate existe para evitar.
_LEGUME_SPECIES: dict[str, str] = {
    "habichuela": "habichuela", "habichuelas": "habichuela",
    "frijol": "habichuela", "frijoles": "habichuela",
    "poroto": "habichuela", "porotos": "habichuela",
    "judia": "habichuela", "judias": "habichuela",
    "judía": "habichuela", "judías": "habichuela",
    "alubia": "habichuela", "alubias": "habichuela",
    "gandul": "gandul", "gandules": "gandul",
    "guandul": "gandul", "guandules": "gandul",
    "lenteja": "lenteja", "lentejas": "lenteja",
    "garbanzo": "garbanzo", "garbanzos": "garbanzo",
    "arveja": "arveja", "arvejas": "arveja",
    "guisante": "arveja", "guisantes": "arveja",
    "haba": "haba", "habas": "haba",
    "soya": "soya", "soja": "soya",
}

_VARIANT_GROUPS: tuple[dict[str, str], ...] = (_BEAN_COLOR, _LEGUME_SPECIES)

_TOKEN_RE = re.compile(r"[a-záéíóúñ]+")


def _values(name: str, group: dict[str, str]) -> set[str]:
    """Valores canónicos del `group` presentes en `name` (match por palabra completa)."""
    return {group[t] for t in _TOKEN_RE.findall(name.casefold()) if t in group}


def variants_conflict(name_a: str, name_b: str) -> bool:
    """`True` = ambos nombres nombran una variante del mismo grupo y difieren (distinto SKU → NO
    auto-linkear). Conservador: un solo lado con variante, o coincidencia → `False`. Ver módulo."""
    for group in _VARIANT_GROUPS:
        values_a = _values(name_a, group)
        values_b = _values(name_b, group)
        if values_a and values_b and values_a.isdisjoint(values_b):
            return True
    return False
