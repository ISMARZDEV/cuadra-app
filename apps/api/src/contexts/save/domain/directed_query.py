"""Consulta dirigida de Loop B (cobertura, F3.1), PURO (ADR 31).

Loop B busca un canónico EXACTO en cada tienda. Decisión resuelta (SDD §12.1): **EAN primero** cuando
la tienda soporta búsqueda por barcode (Sirena/VTEX), **nombre compuesto** (`name` + `display_size`)
como fallback (Magento busca por término). Es donde Cuadra le gana a SupermercadosRD: con EAN el match
es exacto y barato; sin EAN, la cascada semántica valida el candidato del término.
"""
from __future__ import annotations

from dataclasses import dataclass

from .entities import SourcePlatform


@dataclass(frozen=True, slots=True)
class DirectedQuery:
    """Qué buscar en la tienda para cubrir un canónico. `by_ean` decide el modo de búsqueda."""

    text: str
    by_ean: bool


def build_directed_query(
    *,
    name: str,
    display_size: str | None,
    ean: str | None,
    store_supports_ean: bool,
) -> DirectedQuery:
    """EAN si hay y la tienda lo soporta; si no, `name` + `display_size`. Omite el tamaño si falta o
    si el `name` YA lo contiene (evita duplicados tipo "Guandules 15.5 Oz 15.5 Oz", bug live 2026-07-12)."""
    if ean and store_supports_ean:
        return DirectedQuery(text=ean, by_ean=True)
    name_clean = name.strip()
    size = display_size.strip() if display_size else ""
    parts = [name_clean]
    if size and size.lower() not in name_clean.lower():
        parts.append(size)
    return DirectedQuery(text=" ".join(p for p in parts if p), by_ean=False)


def supports_ean(platform: SourcePlatform) -> bool:
    """¿La búsqueda de la plataforma matchea por EAN? VTEX (Sirena) indexa el barcode; Magento busca
    por término/SKU. Heurística por plataforma, afinable con datos reales (teardown SRD §2.1/§2.2)."""
    return platform is SourcePlatform.VTEX


# Plataformas con búsqueda por término/EAN → se puede pedir un canónico EXACTO (target de Loop B).
_DIRECTED_PLATFORMS = frozenset(
    {SourcePlatform.VTEX, SourcePlatform.MAGENTO, SourcePlatform.SHOPIFY}
)


def supports_directed_query(platform: SourcePlatform) -> bool:
    """¿La plataforma permite una búsqueda DIRIGIDA (por término/EAN)? Las browse-only
    (REST_CATALOG/AGGREGATOR/SPA) navegan el catálogo completo e IGNORAN la query — no son target de
    Loop B (cobertura dirigida); su descubrimiento pertenece a Loop A. Hallazgo de la activación en
    vivo 2026-07-12: `RestCatalogAdapter` es browse-full (`factory.py`), correr Loop B ahí haría N
    navegaciones del catálogo entero (una por canónico).

    OJO: es el default DERIVABLE de la plataforma, no la última palabra — ver `DirectedCapability`.
    """
    return platform in _DIRECTED_PLATFORMS


@dataclass(frozen=True, slots=True)
class DirectedCapability:
    """¿Se le puede pedir a ESTA fuente un producto puntual, y su búsqueda matchea por EAN?

    Por qué es un DATO y no una heurística del dominio: `REST_CATALOG` es un adapter GENÉRICO
    manejado por profiles, y cada súper decide qué expone. Bravo tiene lookup exacto por barcode
    (`model.filterByEan`, verificado en vivo 2026-07-15: devuelve el artículo exacto en UNA request
    y SIN filtro de sección) pero NO busca por texto; el próximo súper REST puede ser al revés, o no
    exponer nada. **Una plataforma no puede responder por todos sus profiles.**

    El dominio define el TIPO; infraestructura —la única capa que conoce los profiles— calcula el
    VALOR y lo inyecta (`cover_canonicals`, mismo patrón que `build_adapter`/`classify_error`). Así
    el dominio nunca se entera de que existe un profile llamado "bravova" (ADR 31: domain PURO).
    """

    supported: bool
    by_ean: bool


def platform_capability(platform: SourcePlatform) -> DirectedCapability:
    """Capacidad DERIVABLE solo de la plataforma — el default cuando nadie sabe más.

    Para las browse-only devuelve `supported=False`: sin conocer el profile hay que asumir que la
    fuente navega el catálogo. El default es CONSERVADOR a propósito — equivocarse hacia "es dirigida"
    costaría N navegaciones del catálogo entero (una por canónico), que es el riesgo que motivó el
    gate de 2026-07-12. Equivocarse hacia "browse-only" solo cuesta no cubrirla por Loop B.
    """
    return DirectedCapability(
        supported=supports_directed_query(platform),
        by_ean=supports_ean(platform),
    )
