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


# --- Grupo LEGUMBRE (especie) -------------------------------------------------------------
# El color no alcanza: el falso positivo medido 2026-07-21 comparte color. `LA FAMOSA GANDULES
# VERDES 15 OZ` auto-linkeó a `Habichuela Verde La Famosa 15 Oz` en 0.854 — misma marca, mismo
# tamaño, MISMO color; solo difiere la ESPECIE, y trgm+vector coincidieron en equivocarse (el
# consenso RRF refuerza el sesgo compartido en vez de detectarlo). Ver aispace-men #822.


def test_gandules_vs_habichuela_conflict() -> None:
    # EL caso real medido: mismo color (verde), misma marca, mismo tamaño. Solo la especie difiere.
    assert variants_conflict("LA FAMOSA GANDULES VERDES 15 OZ", "Habichuela Verde La Famosa 15 Oz")


def test_guandules_spelling_variant_conflicts_the_same() -> None:
    # El catálogo escribe "Guandules" (con U) y Bravo "GANDULES" — la misma legumbre. La grafía no
    # debe cambiar la decisión: sigue estando en conflicto contra habichuela.
    assert variants_conflict("Guandules Verdes La Famosa 820 Gr", "Habichuelas Verdes La Famosa 15 Oz")


def test_frijol_is_a_synonym_of_habichuela_and_does_not_conflict() -> None:
    # REGIONALISMO, no especie distinta: frijol/poroto/judía = habichuela. Tratarlos como valores
    # distintos rompería matches BUENOS (un empaque mexicano contra el canónico dominicano).
    assert not variants_conflict("Frijoles Negros Goya 15 Oz", "Habichuelas Negras Goya 15 Oz")


def test_same_legume_different_spelling_does_not_conflict() -> None:
    # Gandules vs Guandules: misma especie. El tamaño distinto es problema del size_gate, no de este.
    assert not variants_conflict("GANDULES VERDES LA FAMOSA 15 OZ", "Guandules Verdes La Famosa 820 Gr")


def test_lenteja_vs_garbanzo_conflict() -> None:
    assert variants_conflict("Lentejas La Famosa 15 Oz", "Garbanzos La Famosa 15 Oz")


def test_only_one_side_names_a_legume_does_not_conflict() -> None:
    # Conservador, igual que el grupo color: sin contradicción POSITIVA no se bloquea.
    assert not variants_conflict("La Famosa Verdes 15 Oz", "Habichuela Verde La Famosa 15 Oz")


def test_mixed_product_naming_both_legumes_does_not_conflict() -> None:
    # "Habichuelas con Gandules" nombra AMBAS: los conjuntos se intersectan → no es contradicción.
    assert not variants_conflict(
        "Habichuelas con Gandules La Famosa 15 Oz", "Habichuela Verde La Famosa 15 Oz"
    )


def test_legume_as_substring_does_not_false_trigger() -> None:
    # "Habanero" contiene "haba" pero NO es la legumbre. Match por PALABRA completa, nunca subcadena.
    assert not variants_conflict("Salsa Habanero Picante", "Habas Secas La Famosa 15 Oz")
