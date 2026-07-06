"""Unit — `ssrf_guard`: guardas SSRF pre-connect para el dry-run de `TestSource` (F2·B1/B3,
Batch 3C, tarea 3.9). https-only sin excepciones + resolución DNS pre-connect rechazando
loopback/privado/link-local/reservado/CGN — incluye 169.254.169.254, el endpoint de METADATA
de AWS/GCP/Azure y el target SSRF más común en producción. Mockea DNS (`socket.getaddrinfo`) y
HTTP (`httpx.MockTransport`) — nunca red real.
"""
from __future__ import annotations

import socket
from unittest.mock import patch

import httpx
import pytest

from src.contexts.save.infrastructure.catalog_sources.ssrf_guard import (
    ResponseTooLargeError,
    SsrfBlockedError,
    guarded_get,
    guarded_post,
)


def _addrinfo(*ips: str) -> list[tuple]:
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443)) for ip in ips]


def test_rejects_http_scheme() -> None:
    with pytest.raises(SsrfBlockedError, match="https"):
        guarded_get("http://example.com/x")


def test_rejects_ftp_scheme() -> None:
    with pytest.raises(SsrfBlockedError, match="https"):
        guarded_get("ftp://example.com/x")


def test_rejects_resolved_loopback_ip() -> None:
    with patch("socket.getaddrinfo", return_value=_addrinfo("127.0.0.1")):
        with pytest.raises(SsrfBlockedError):
            guarded_get("https://malicious.example.com/x")


@pytest.mark.parametrize("ip", ["10.0.0.1", "192.168.1.1", "172.16.0.1"])
def test_rejects_resolved_private_ip(ip: str) -> None:
    with patch("socket.getaddrinfo", return_value=_addrinfo(ip)):
        with pytest.raises(SsrfBlockedError):
            guarded_get("https://malicious.example.com/x")


def test_rejects_aws_metadata_endpoint() -> None:
    """169.254.169.254 (link-local): el target SSRF #1 en producción (metadata AWS/GCP/Azure)."""
    with patch("socket.getaddrinfo", return_value=_addrinfo("169.254.169.254")):
        with pytest.raises(SsrfBlockedError):
            guarded_get("https://malicious.example.com/x")


def test_rejects_cgn_nat_range_not_covered_by_is_private() -> None:
    """100.64.0.0/10 (CGN): `ipaddress.is_private` NO lo cubre en Python 3.13 — se cierra con
    `is_global`, verificado en REPL antes de escribir el guard."""
    with patch("socket.getaddrinfo", return_value=_addrinfo("100.64.0.1")):
        with pytest.raises(SsrfBlockedError):
            guarded_get("https://malicious.example.com/x")


def test_rejects_ipv6_loopback() -> None:
    addrs = [(socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("::1", 443, 0, 0))]
    with patch("socket.getaddrinfo", return_value=addrs):
        with pytest.raises(SsrfBlockedError):
            guarded_get("https://malicious.example.com/x")


def test_rejects_if_any_of_multiple_resolved_ips_is_disallowed() -> None:
    """DNS multi-respuesta estilo rebinding: una IP pública + una privada -> falla cerrado."""
    with patch("socket.getaddrinfo", return_value=_addrinfo("8.8.8.8", "127.0.0.1")):
        with pytest.raises(SsrfBlockedError):
            guarded_get("https://multi.example.com/x")


def test_allows_public_ip_and_parses_json_get(monkeypatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{"productId": "1"}])

    monkeypatch.setattr(
        "src.contexts.save.infrastructure.catalog_sources.ssrf_guard._make_client",
        lambda: httpx.Client(transport=httpx.MockTransport(handler)),
    )
    with patch("socket.getaddrinfo", return_value=_addrinfo("8.8.8.8")):
        result = guarded_get("https://legit.example.com/api")

    assert result == [{"productId": "1"}]


def test_allows_public_ip_and_parses_json_post(monkeypatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": {"products": {"items": []}}})

    monkeypatch.setattr(
        "src.contexts.save.infrastructure.catalog_sources.ssrf_guard._make_client",
        lambda: httpx.Client(transport=httpx.MockTransport(handler)),
    )
    with patch("socket.getaddrinfo", return_value=_addrinfo("8.8.8.8")):
        result = guarded_post("https://legit.example.com/graphql", {"query": "x"}, {})

    assert result == {"data": {"products": {"items": []}}}


def test_response_over_size_cap_is_rejected(monkeypatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"x" * (6_000_000))

    monkeypatch.setattr(
        "src.contexts.save.infrastructure.catalog_sources.ssrf_guard._make_client",
        lambda: httpx.Client(transport=httpx.MockTransport(handler)),
    )
    with patch("socket.getaddrinfo", return_value=_addrinfo("8.8.8.8")):
        with pytest.raises(ResponseTooLargeError):
            guarded_get("https://legit.example.com/huge")
