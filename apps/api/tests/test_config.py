"""Unit — derivaciones de config de Clerk (issuer → JWKS, authorized parties, enabled)."""
from __future__ import annotations

from src.config import Settings


def test_clerk_disabled_when_issuer_empty() -> None:
    assert Settings(clerk_issuer="").clerk_enabled is False


def test_clerk_enabled_when_issuer_set() -> None:
    assert Settings(clerk_issuer="https://cuadra.clerk.accounts.dev").clerk_enabled is True


def test_jwks_url_derived_from_issuer() -> None:
    s = Settings(clerk_issuer="https://cuadra.clerk.accounts.dev")
    assert s.clerk_jwks_url == "https://cuadra.clerk.accounts.dev/.well-known/jwks.json"


def test_jwks_url_strips_trailing_slash() -> None:
    s = Settings(clerk_issuer="https://cuadra.clerk.accounts.dev/")
    assert s.clerk_jwks_url == "https://cuadra.clerk.accounts.dev/.well-known/jwks.json"


def test_authorized_party_list_parses_comma_separated() -> None:
    s = Settings(clerk_authorized_parties="http://localhost:3006, https://cuadra.do")
    assert s.clerk_authorized_party_list == ["http://localhost:3006", "https://cuadra.do"]
