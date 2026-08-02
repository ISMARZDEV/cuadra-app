"""Unit — form gate de la cascada de matching (PURO). Ver `infrastructure/matching/cascade/
form_gate.py`.

Medido 2026-08-01 en la primera corrida con el juez encendido: 3 falsos merges por FORMA de
preparación que ningún gate existente atajaba —

  · `GOYA HARINA ARROZ 24OZ`            → `Arroz Goya Valencia 24 Oz`        (llm,    0.850)
  · `Habichuelas Rojas Guisadas Goya`   → `Habichuelas Rojas Red Kidney Goya`(llm,    0.850)
  · `Guandules Verdes Guisados Goya`    → `Guandules Verdes Goya 15 Oz`      (hybrid, 0.902)

Los dos primeros los produjo el juez; el tercero la cascada determinista — o sea que el eje falla
en AMBOS caminos, no es un problema del LLM. Simulado sobre los 126 enlaces auto_linked de esa
corrida, este gate bloquea EXACTAMENTE esos 3 y no rompe ningún enlace bueno.
"""
from __future__ import annotations

from src.contexts.save.infrastructure.matching.cascade.form_gate import forms_conflict


# --- Los tres casos REALES medidos ---------------------------------------------------------


def test_harina_de_arroz_is_not_arroz() -> None:
    # Harina = producto MOLIDO, otro SKU y otro anaquel. El juez lo fusionó con 0.850 de confianza.
    assert forms_conflict("GOYA HARINA ARROZ 24OZ", "Arroz Goya Valencia 24 Oz")


def test_habichuelas_guisadas_are_not_dry_beans() -> None:
    # Guisadas = en salsa, listas para comer. Red Kidney = secas. El juez las fusionó con 0.850.
    assert forms_conflict(
        "Habichuelas Rojas Guisadas Goya 15.5 Onz", "Habichuelas Rojas Red Kidney Goya 15.5oz"
    )


def test_guisados_conflict_on_the_deterministic_path_too() -> None:
    # Este NO lo produjo el juez sino la cascada (hybrid, 0.902): marca, tamaño, color y especie
    # coinciden, y sólo difiere la preparación. Prueba que el eje falta en los DOS caminos.
    assert forms_conflict("Guandules Verdes Guisados Goya 15 Onz", "Guandules Verdes Goya 15 Oz")


# --- La asimetría: NO-MARCADO significa la forma BASE ---------------------------------------
#
# Es la diferencia de fondo con `variant_gate`, y la razón de que este gate viva aparte. Allá, un
# lado sin color significa "no sabemos" y NO se bloquea. Acá, un nombre sin marca de forma nombra
# el producto BASE: "Arroz" a secas ES grano, no "arroz de forma desconocida". Por eso
# marcado-vs-no-marcado SÍ es contradicción. Misma asimetría deliberada que `brand_gate`, que
# bloquea por AUSENCIA de evidencia.


def test_marked_against_unmarked_conflicts_in_both_directions() -> None:
    # La dirección no puede cambiar la decisión: el par es el mismo par.
    assert forms_conflict("Harina de Arroz Goya 24 Oz", "Arroz Goya Valencia 24 Oz")
    assert forms_conflict("Arroz Goya Valencia 24 Oz", "Harina de Arroz Goya 24 Oz")


def test_same_form_on_both_sides_does_not_conflict() -> None:
    # Ambos son harina → mismo SKU en lo que a forma respecta. El tamaño es problema del size_gate.
    assert not forms_conflict("GOYA HARINA ARROZ 24OZ", "Harina de Arroz Goya 24 Oz")


def test_neither_names_a_form_does_not_conflict() -> None:
    # El caso masivo y el que NO hay que romper: dos granos sin marca de forma.
    assert not forms_conflict("Arroz Selecto Wala 5 Lb", "Arroz Selecto Wala 5lb")


def test_two_different_forms_conflict() -> None:
    assert forms_conflict("Harina de Maíz La Famosa", "Pasta de Maíz La Famosa")


# --- Robustez ------------------------------------------------------------------------------


def test_is_case_insensitive() -> None:
    assert forms_conflict("HABICHUELAS GUISADAS GOYA", "habichuelas goya")


def test_singular_and_plural_are_the_same_form() -> None:
    # Guisada/guisadas/guisado/guisados colapsan al mismo valor: el número gramatical y el género
    # NO son una diferencia de producto.
    assert not forms_conflict("Habichuela Guisada Goya", "Habichuelas Guisadas Goya")


def test_form_as_substring_does_not_false_trigger() -> None:
    # Match por PALABRA completa, nunca subcadena — igual que `variant_gate`. "Harinado" contiene
    # "harina" y "Cremoso" contiene "crema", pero ninguno nombra la forma.
    assert not forms_conflict("Arroz Harinado Especial", "Arroz Goya Valencia 24 Oz")
    assert not forms_conflict("Arroz Cremoso Listo", "Arroz Goya Valencia 24 Oz")


def test_a_name_marking_two_forms_matches_the_same_pair() -> None:
    # "Crema de Leche" nombra dos marcadores; contra otro "Crema de Leche" los conjuntos son
    # IGUALES → no hay contradicción.
    assert not forms_conflict("Crema de Leche Rica 200 Ml", "Crema de Leche Rica 200Ml")
