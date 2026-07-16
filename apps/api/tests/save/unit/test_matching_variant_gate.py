"""Unit — variant gate de la cascada de matching (PURO). Ver `infrastructure/matching/cascade/
variant_gate.py`. El EAN gate cierra el falso-merge SOLO donde hay barcode; en Magento (sin EAN)
un cruce de VARIANTE (pinta→negra, roja→pinta) auto-linkeaba porque marca+tamaño coinciden y solo
el contenido difiere. Medido 2026-07-16: 3 falsos-positivos así. Este gate lo cubre por el nombre.
"""
from __future__ import annotations

from src.contexts.save.infrastructure.matching.cascade.variant_gate import variants_conflict


def test_conflicting_bean_colors_conflict() -> None:
    # El caso real medido: Habichuela Pinta La Sanjuanera → Habichuelas Negras La Sanjuanera.
    assert variants_conflict(
        "Habichuela Pinta La Sanjuanera 800 Gr", "Habichuelas Negras La Sanjuanera 800 Gr."
    )


def test_roja_vs_pinta_conflict() -> None:
    # Goya Habichuelas Rojas Organicas → Habichuelas Goya Pintas.
    assert variants_conflict("Goya Habichuelas Rojas Organicas 15 Oz", "Habichuelas Goya Pintas 15.5 Oz.")


def test_same_color_singular_vs_plural_does_not_conflict() -> None:
    # Roja vs Rojas: MISMO color, solo número gramatical → NUNCA conflicto (falso positivo a evitar).
    assert not variants_conflict(
        "Habichuela Roja Larga La Sanjuanera 800", "Habichuelas Rojas Largas La Sanjuanera 800 Gr."
    )


def test_incoming_without_color_does_not_conflict() -> None:
    # Solo un lado nombra color → no se puede PROBAR contradicción → no bloquea (conservador, como el EAN gate).
    assert not variants_conflict("Habichuelas La Famosa 15 Oz", "Habichuelas Rojas La Famosa 15 Oz")


def test_neither_names_a_color_does_not_conflict() -> None:
    assert not variants_conflict("Arroz Selecto Wala 5 Lb", "Arroz Selecto Wala 5lb")


def test_same_color_does_not_conflict() -> None:
    assert not variants_conflict("Habichuelas Rojas La Famosa 15 Oz", "Habichuelas Rojas La Famosa 15 Oz")


def test_is_case_insensitive() -> None:
    assert variants_conflict("HABICHUELAS ROJAS", "habichuelas negras")


def test_color_as_substring_does_not_false_trigger() -> None:
    # El color debe matchear como PALABRA completa, no como subcadena: "Pintada" contiene "pinta"
    # pero NO es el color pinta. Un match por subcadena dispararía un falso conflicto contra "negra".
    assert not variants_conflict("Crema Pintada Especial", "Habichuelas Negras La Famosa")
