"""Puerto de ingesta de Save (§6.2), PURO (ADR 31): `CatalogSource` + `RawCatalogEntry`.

`CatalogSource` es la interfaz (typing.Protocol) que implementa cada adaptador por plataforma
(VTEX, Magento, agregador, agente-IA). Devuelve `RawCatalogEntry`: el registro CRUDO (bronze),
ya con precio en Money pero ANTES del matching. El `size_text` es el string crudo del catálogo
(se normaliza luego con parse_size). `market_id` viaja en cada entrada (multi-país).
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Protocol

from src.shared.money import Money

from ..entities import PriceType


@dataclass(frozen=True, slots=True)
class RawCatalogEntry:
    provider_id: str
    market_id: str
    external_id: str        # sku/productId en la tienda de origen
    name: str
    brand: str
    size_text: str          # tamaño crudo ("5lb") → parse_size lo normaliza
    price: Money
    price_type: PriceType
    source: str             # "vtex" | "magento" | "aggregator" | ...
    category_path: tuple[str, ...] = ()
    ean: str | None = None
    url: str | None = None
    # TODAS las imágenes que publica la tienda, EN SU ORDEN (F5, tarea 9). Antes se guardaba una
    # sola y el resto se descartaba, aunque el payload ya las traía: la galería del canónico
    # (1ª, 2ª, 3ª) se alimenta de acá, y con una sola foto por tienda no hay galería que armar.
    #
    # El orden de la tienda se PRESERVA: pone la foto del producto primero y la etiqueta
    # nutricional después; invertirlo pondría la tabla de nutrición como imagen principal.
    image_urls: tuple[str, ...] = ()
    # Descripción publicada por la tienda. `None` = no la trae (distinto de traerla vacía).
    description: str | None = None
    # §15.3: localizador(es) extra para el re-fetch por-producto (camino A) cuando `external_id` no
    # alcanza. Bravo → {"id_articulo": "29866"} (el `/get` usa idArticulo, no idexterno). Casi
    # siempre None (external_id = productId/SKU ya es el localizador).
    source_ref: dict[str, str] | None = None

    @property
    def primary_image_url(self) -> str | None:
        """La imagen principal = la PRIMERA de la tienda. Una sola fuente de verdad: derivarla
        evita que `image_url` y la galería puedan discrepar."""
        return self.image_urls[0] if self.image_urls else None


class CatalogSource(Protocol):
    """Fuente de catálogo: un adaptador por plataforma. Reusable país por país."""

    def fetch(self) -> Iterable[RawCatalogEntry]: ...


class ProductDetailSource(Protocol):
    """Re-fetch DIRECTO de UN producto YA conocido por su `external_id`/`url` (F3.2a, camino A del
    refresh de frescura). A diferencia de `CatalogSource.fetch()` (busca/navega), pide ese producto
    puntual — 1 request = 1 producto. Devuelve None si la tienda ya no lo tiene (→ is_available=false
    o, en F3.2b, fallback a la búsqueda dirigida). Lo implementan las plataformas con detalle por id
    (VTEX productId / Magento SKU); las browse-only no."""

    def fetch_by_external_id(
        self, external_id: str, url: str | None, source_ref: dict | None = None
    ) -> RawCatalogEntry | None:
        """`source_ref` (§15.3) trae localizadores extra (Bravo `id_articulo`) cuando `external_id`
        no alcanza para el detalle. VTEX/Magento lo ignoran (external_id ya es el localizador)."""
        ...
