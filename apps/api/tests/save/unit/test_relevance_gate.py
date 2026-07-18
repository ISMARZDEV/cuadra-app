"""Unit — TaxonomyRelevanceGate (R2, PURO con fakes, sin DB).

Clasifica el producto DESCUBIERTO a nuestra taxonomía (por NOMBRE + categoría de origen, vía
`ClassifyStoreProduct.decide`) y contrasta la RAÍZ de la hoja resultante con el FOOTPRINT del
catálogo. Conservador: descarta SOLO ante clasificación CONFIADA (banda `auto_link`) fuera del
footprint; ante duda (None / grey / human), NO descarta — no perder descubrimiento legítimo.
"""
from __future__ import annotations

from src.contexts.save.domain.classification import ClassifiableProduct, ClassificationResult
from src.contexts.save.infrastructure.classification.relevance_gate import TaxonomyRelevanceGate

_LEAF_TO_ROOT = {"leaf-arroz": "root-despensa", "leaf-perros": "root-mascotas"}
_FOOTPRINT = frozenset({"root-despensa"})  # el catálogo (piloto) solo cubre despensa


class _FakeClassifier:
    """Devuelve un ClassificationResult fijo — aísla el gate de la cascada real."""

    def __init__(self, result: ClassificationResult) -> None:
        self._result = result
        self.calls: list[tuple[str, str]] = []

    def decide(self, product: ClassifiableProduct, market_id: str) -> ClassificationResult:
        self.calls.append((product.name, market_id))
        return self._result


def _gate(result: ClassificationResult, footprint=_FOOTPRINT) -> TaxonomyRelevanceGate:  # type: ignore[no-untyped-def]
    return TaxonomyRelevanceGate(
        classifier=_FakeClassifier(result),
        leaf_to_root=_LEAF_TO_ROOT,
        footprint=footprint,
        market_id="DO",
    )


def _product(name: str = "Alimento Seco para Perro") -> ClassifiableProduct:
    return ClassifiableProduct(ref_id="", is_canonical=False, name=name)


def test_confident_off_footprint_classification_is_off_scope() -> None:
    # comida de perro → leaf-perros → root-mascotas ∉ footprint, banda auto → descarta.
    gate = _gate(ClassificationResult("leaf-perros", 0.95, "lexicon", "auto_link"))
    assert gate.is_off_scope(_product("Alimento Seco para Perro"))


def test_confident_in_footprint_classification_is_kept() -> None:
    gate = _gate(ClassificationResult("leaf-arroz", 0.95, "lexicon", "auto_link"))
    assert not gate.is_off_scope(_product("Arroz La Garza 5 Lb"))


def test_unclassified_is_kept_conservative() -> None:
    # sin hoja → sin señal → NO descarta (no perder descubrimiento).
    gate = _gate(ClassificationResult(None, 0.0, "none", "human"))
    assert not gate.is_off_scope(_product("Cosa Rara XYZ"))


def test_grey_band_is_kept_even_if_off_footprint() -> None:
    # clasificación DUDOSA (grey) fuera del footprint → NO descarta: solo la confiada descarta.
    gate = _gate(ClassificationResult("leaf-perros", 0.6, "trgm", "grey"))
    assert not gate.is_off_scope(_product("Algo ambiguo"))


def test_leaf_that_is_itself_a_root_uses_itself() -> None:
    gate = TaxonomyRelevanceGate(
        classifier=_FakeClassifier(ClassificationResult("root-despensa", 0.95, "lexicon", "auto_link")),
        leaf_to_root={},  # la hoja no está en el mapa → se usa ella misma como raíz
        footprint=frozenset({"root-despensa"}),
        market_id="DO",
    )
    assert not gate.is_off_scope(_product("Arroz"))


def test_off_scope_when_no_footprint_overlap() -> None:
    gate = _gate(
        ClassificationResult("leaf-arroz", 0.95, "lexicon", "auto_link"),
        footprint=frozenset({"root-otro"}),
    )
    assert gate.is_off_scope(_product("Arroz"))
