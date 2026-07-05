"""Unit — entidad ProductMatch (F2.0 matching foundation). PURA, sin DB."""
from __future__ import annotations

import pytest

from src.contexts.save.domain.entities import ProductMatch


def _make(**overrides: object) -> ProductMatch:
    fields = {
        "store_product_id": "sp1",
        "canonical_product_id": "cp1",
        "confidence": 0.92,
        "method": "trgm",
        "status": "auto_linked",
    }
    fields.update(overrides)
    return ProductMatch(**fields)  # type: ignore[arg-type]


def test_product_match_accepts_valid_method_and_status() -> None:
    m = _make()
    assert m.method == "trgm"
    assert m.status == "auto_linked"


@pytest.mark.parametrize("method", ["ean", "trgm", "vector", "hybrid", "llm", "human"])
def test_product_match_accepts_all_valid_methods(method: str) -> None:
    m = _make(method=method)
    assert m.method == method


def test_product_match_rejects_invalid_method() -> None:
    with pytest.raises(ValueError):
        _make(method="magic")


@pytest.mark.parametrize("status", ["auto_linked", "pending_review", "rejected"])
def test_product_match_accepts_all_valid_statuses(status: str) -> None:
    m = _make(status=status)
    assert m.status == status


def test_product_match_rejects_invalid_status() -> None:
    with pytest.raises(ValueError):
        _make(status="unknown_status")


def test_product_match_confidence_is_float() -> None:
    m = _make(confidence=0.5)
    assert isinstance(m.confidence, float)
    assert m.confidence == 0.5


def test_product_match_canonical_product_id_may_be_none_when_pending() -> None:
    m = _make(canonical_product_id=None, status="pending_review", method="human", confidence=0.0)
    assert m.canonical_product_id is None
    assert m.status == "pending_review"


def test_product_match_is_frozen() -> None:
    m = _make()
    with pytest.raises(Exception):
        m.confidence = 0.1  # type: ignore[misc]
