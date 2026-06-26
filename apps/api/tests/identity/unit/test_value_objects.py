"""Unit — value objects de identity (encapsulan invariantes)."""
from __future__ import annotations

import pytest

from src.contexts.identity.domain.value_objects import Email, MarketId


def test_email_valid_normalizes_lowercase_and_trim() -> None:
    assert Email("  User@Example.COM ").value == "user@example.com"


@pytest.mark.parametrize("bad", ["not-an-email", "a@b", "@x.com", "x@y", ""])
def test_email_invalid_raises(bad: str) -> None:
    with pytest.raises(ValueError):
        Email(bad)


def test_market_id_normalizes_uppercase() -> None:
    assert MarketId("do").value == "DO"


@pytest.mark.parametrize("bad", ["DOM", "D", "D1", "12", ""])
def test_market_id_invalid_raises(bad: str) -> None:
    with pytest.raises(ValueError):
        MarketId(bad)
