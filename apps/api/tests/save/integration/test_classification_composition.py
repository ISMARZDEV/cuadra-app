"""Integration — composición del clasificador (save-category-classification, Batch 9). DB para el on-path.

Ship-dark: `build_classifier`/`build_category_embedder` devuelven None con el flag OFF; con el flag
ON construyen los use cases reales (léxico sembrado desde la taxonomía del market de ingesta).
"""
from __future__ import annotations

from ingestion.save.composition import build_category_embedder, build_classifier
from src.config import settings
from src.contexts.save.application.classify_store_product import ClassifyStoreProduct
from src.contexts.save.application.embed_categories import EmbedCategories


def test_classifier_is_none_when_flag_off(db_session, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(settings, "save_classification_enabled", False)
    assert build_classifier(db_session) is None
    assert build_category_embedder(db_session) is None


def test_classifier_built_when_flag_on(db_session, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(settings, "save_classification_enabled", True)
    assert isinstance(build_classifier(db_session), ClassifyStoreProduct)
    assert isinstance(build_category_embedder(db_session), EmbedCategories)
