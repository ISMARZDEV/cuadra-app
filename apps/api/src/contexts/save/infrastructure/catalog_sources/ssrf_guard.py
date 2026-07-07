"""Guarda SSRF pre-connect para el dry-run de `TestSource` (F2·B1/B3, Batch 3C, tarea 3.9).

Antes de CUALQUIER request HTTP saliente del "probar fuente": (1) https-only, sin excepciones
(ni localhost); (2) resuelve el host a IP(s) ANTES de conectar (`socket.getaddrinfo`) y rechaza
si CUALQUIERA de las IPs resueltas es loopback/privada/link-local/reservada/no-especificada/
multicast — incluye 169.254.169.254 (el endpoint de METADATA de AWS/GCP/Azure, el target SSRF
más común en producción) y el rango CGN NAT 100.64.0.0/10 (`ipaddress.is_private` NO lo cubre en
Python 3.13 — verificado en REPL antes de escribir esto; se cierra con `is_global`, que sí lo
excluye); (3) timeout corto (segundos, no los 30s por defecto de los adapters — esto es un botón
interactivo, no una ingesta batch); (4) cap de tamaño de respuesta vía streaming (no confía en
`Content-Length`, que puede faltar o mentir).

Riesgo residual documentado (dejado a propósito, no cerrado): esto es un chequeo PRE-CONNECT —
entre la resolución DNS de acá y la conexión real de httpx hay una ventana TOCTOU/DNS-rebinding
(el hostname podría re-resolver a otra IP). Cerrarlo del todo requeriría fijar (pin) la IP
resuelta para la conexión real (ej. un transport httpx custom que conecte directo a esa IP).
No se implementa: la única vía práctica con httpx es parchear `socket.getaddrinfo` globalmente
durante el request, y en un proceso FastAPI compartido eso es estado mutable global no
thread-safe — dos "probar" concurrentes a hosts distintos se pisarían entre sí, un riesgo de
concurrencia peor que el gap que se busca cerrar. El chequeo pre-connect es el trade-off correcto
para este batch (así lo pide la tarea); el pinning real queda como mejora futura si el volumen
de "probar" lo amerita.
"""
from __future__ import annotations

import ipaddress
import json
import socket
from urllib.parse import urlsplit

import httpx

_CONNECT_TIMEOUT = 3.0
_READ_TIMEOUT = 5.0
_MAX_RESPONSE_BYTES = 5_000_000  # suficiente para una muestra de 10 productos, no una descarga libre


class SsrfBlockedError(Exception):
    """El guard SSRF rechazó la URL: scheme distinto de https, o resuelve a una IP no permitida."""


class ResponseTooLargeError(Exception):
    """La respuesta supera el cap de tamaño — se aborta el streaming, no se buferiza sin límite."""


def _is_disallowed_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return (
        ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_unspecified
        or ip.is_multicast
        or not ip.is_global  # cierra 100.64.0.0/10 (CGN NAT), que `is_private` no cubre acá
    )


def _assert_https_and_safe_host(url: str) -> None:
    parts = urlsplit(url)
    if parts.scheme != "https":
        raise SsrfBlockedError(f"Solo se permite https, sin excepciones: {url!r}")
    hostname = parts.hostname
    if not hostname:
        raise SsrfBlockedError(f"URL sin host: {url!r}")
    port = parts.port or 443
    try:
        resolved = socket.getaddrinfo(hostname, port)
    except socket.gaierror as exc:
        raise SsrfBlockedError(f"No se pudo resolver el host: {hostname!r}") from exc
    for _family, _type, _proto, _canonname, sockaddr in resolved:
        ip = ipaddress.ip_address(sockaddr[0])
        if _is_disallowed_ip(ip):
            raise SsrfBlockedError(f"IP resuelta no permitida para {hostname!r}: {ip}")


def _make_client() -> httpx.Client:
    timeout = httpx.Timeout(
        connect=_CONNECT_TIMEOUT, read=_READ_TIMEOUT, write=_CONNECT_TIMEOUT, pool=_CONNECT_TIMEOUT
    )
    return httpx.Client(timeout=timeout, follow_redirects=False)


def _read_capped(response: httpx.Response) -> bytes:
    body = bytearray()
    for chunk in response.iter_bytes():
        body += chunk
        if len(body) > _MAX_RESPONSE_BYTES:
            raise ResponseTooLargeError(f"Respuesta excede el cap de {_MAX_RESPONSE_BYTES} bytes")
    return bytes(body)


def guarded_get(url: str) -> list[dict]:
    """`http_get` SSRF-guardado, mismo hook de inyección que `VtexAdapter._default_get`."""
    _assert_https_and_safe_host(url)
    with _make_client() as client, client.stream("GET", url, headers={"User-Agent": "Cuadra/Save"}) as response:
        response.raise_for_status()
        body = _read_capped(response)
    return json.loads(body)


def guarded_post(url: str, payload: dict, headers: dict[str, str]) -> dict:
    """`http_post` SSRF-guardado, mismo hook de inyección que `MagentoAdapter._default_post`."""
    _assert_https_and_safe_host(url)
    with _make_client() as client, client.stream("POST", url, json=payload, headers=headers) as response:
        response.raise_for_status()
        body = _read_capped(response)
    return json.loads(body)
