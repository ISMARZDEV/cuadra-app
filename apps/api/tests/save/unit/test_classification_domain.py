"""Unit — entidades de dominio de clasificación (save-category-classification, Batch 3). PURO."""
from __future__ import annotations

from src.contexts.save.domain.classification import (
    CategoryCandidate,
    CategoryClassification,
    ClassifiableProduct,
    ClassificationResult,
)


def test_classifiable_product_construct() -> None:
    p = ClassifiableProduct(
        ref_id="sp-1", is_canonical=False, name="Arroz Blanco", brand="Sirena", size_text="5 Lb"
    )
    assert p.ref_id == "sp-1"
    assert p.is_canonical is False


def test_candidate_carries_source_and_score() -> None:
    c = CategoryCandidate(taxonomy_node_id="n1", score=0.8, source="trgm")
    assert c.source == "trgm"


def test_result_allows_unclassified() -> None:
    r = ClassificationResult(taxonomy_node_id=None, confidence=0.0, method="none", band="human")
    assert r.taxonomy_node_id is None


def test_classification_record_fields() -> None:
    c = CategoryClassification(
        id="c1", store_product_id="sp-1", canonical_product_id=None,
        taxonomy_node_id="leaf-1", confidence=0.95, method="lexicon", status="active",
    )
    assert c.status == "active"
    assert c.canonical_product_id is None
