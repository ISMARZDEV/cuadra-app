"""Unit — entidad Collection (colección curada A6). PURA, sin DB."""
from __future__ import annotations

import pytest

from src.contexts.save.domain.entities import Collection


def test_collection_requires_name() -> None:
    with pytest.raises(ValueError):
        Collection(id="c1", slug="premium", name="  ", market_id="DO")


def test_collection_requires_slug() -> None:
    with pytest.raises(ValueError):
        Collection(id="c1", slug="", name="Selección premium", market_id="DO")


def test_collection_requires_market() -> None:
    with pytest.raises(ValueError):
        Collection(id="c1", slug="premium", name="Selección premium", market_id="")


def test_collection_is_frozen() -> None:
    c = Collection(id="c1", slug="premium", name="Selección premium", market_id="DO")
    with pytest.raises(Exception):
        c.name = "otro"  # type: ignore[misc]
