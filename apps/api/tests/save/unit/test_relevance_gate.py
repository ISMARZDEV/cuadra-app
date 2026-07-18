"""Unit — TaxonomyRelevanceGate (R2, PURO sobre datos construidos, sin DB).

Resuelve el `source_category` de un producto descubierto a un top-level de taxonomía (vía el lexicon
+ mapa hoja→raíz) y lo contrasta con el FOOTPRINT del catálogo (las raíces que ocupan los canónicos).
Conservador: descarta SOLO cuando resuelve a una raíz FUERA del footprint; ante duda (no resuelve),
NO descarta — no perder descubrimiento legítimo.
"""
from __future__ import annotations

from src.contexts.save.infrastructure.classification.relevance_gate import TaxonomyRelevanceGate

_LEXICON = {"arroz": "leaf-arroz", "perros": "leaf-perros", "cloro": "leaf-limpieza"}
_LEAF_TO_ROOT = {
    "leaf-arroz": "root-despensa",
    "leaf-perros": "root-mascotas",
    "leaf-limpieza": "root-hogar",
}
_FOOTPRINT = frozenset({"root-despensa"})  # el catálogo (piloto) solo cubre despensa


def _gate(footprint=_FOOTPRINT) -> TaxonomyRelevanceGate:  # type: ignore[no-untyped-def]
    return TaxonomyRelevanceGate(lexicon=_LEXICON, leaf_to_root=_LEAF_TO_ROOT, footprint=footprint)


def test_off_footprint_category_is_off_scope() -> None:
    # "perros" → leaf-perros → root-mascotas ∉ footprint → descarta.
    assert _gate().is_off_scope("Mascotas > Alimento para Perros")


def test_off_footprint_cleaning_is_off_scope() -> None:
    assert _gate().is_off_scope("Cuidado del Hogar > Cloro")


def test_in_footprint_category_is_kept() -> None:
    # "arroz" → leaf-arroz → root-despensa ∈ footprint → NO descarta.
    assert not _gate().is_off_scope("Despensa > Arroz")


def test_unresolved_category_is_kept_conservative() -> None:
    # Ningún token resuelve → no podemos PROBAR que está fuera → NO descarta (no perder descubrimiento).
    assert not _gate().is_off_scope("Cosa Rara Sin Match XYZ")


def test_empty_category_is_kept() -> None:
    assert not _gate().is_off_scope("")


def test_leaf_that_is_itself_a_root_uses_itself(footprint=None) -> None:
    # Si la hoja no está en leaf_to_root (es una raíz), se usa ella misma como raíz.
    gate = TaxonomyRelevanceGate(
        lexicon={"arroz": "root-despensa"}, leaf_to_root={}, footprint=frozenset({"root-despensa"})
    )
    assert not gate.is_off_scope("Despensa > Arroz")  # root-despensa ∈ footprint


def test_off_scope_when_no_footprint_overlap() -> None:
    # footprint distinto → todo lo que resuelve queda fuera.
    assert _gate(footprint=frozenset({"root-otro"})).is_off_scope("Despensa > Arroz")
