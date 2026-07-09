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


# CORS — el web de dev SIEMPRE corre en :3006. Un `CORS_ORIGINS` fantasma exportado en la
# shell (p.ej. apuntando a :3000) NO debe poder tumbar el preflight del web (§12·E E.1).

def test_dev_cors_always_includes_web_origin_even_if_env_omits_it() -> None:
    # Simula el fantasma: el entorno solo declara :3000, el web (:3006) igual debe entrar.
    s = Settings(app_env="dev", cors_origins="http://localhost:3000")
    assert "http://localhost:3006" in s.cors_origin_list
    assert "http://localhost:3000" in s.cors_origin_list


def test_dev_cors_does_not_duplicate_web_origin() -> None:
    s = Settings(app_env="dev", cors_origins="http://localhost:3006,http://localhost:3000")
    assert s.cors_origin_list.count("http://localhost:3006") == 1


def test_prod_cors_is_untouched() -> None:
    # En prod el allow-list es EXACTAMENTE lo configurado; no inyectamos el origen de dev.
    s = Settings(app_env="prod", cors_origins="https://cuadra.do")
    assert s.cors_origin_list == ["https://cuadra.do"]
