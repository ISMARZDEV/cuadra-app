"""Unit — consulta dirigida de Loop B (F3.1): cómo buscar un canónico EXACTO en una tienda.

Decisión resuelta (SDD §12.1): EAN primero cuando la tienda soporta búsqueda por barcode (Sirena/
VTEX trae EAN), nombre compuesto (name + display_size) como fallback (Magento busca por término).
PURO — sin red ni DB.
"""
from __future__ import annotations

from src.contexts.save.domain.directed_query import (
    DirectedCapability,
    build_directed_query,
    platform_capability,
    supports_directed_query,
    supports_ean,
)
from src.contexts.save.domain.entities import SourcePlatform


def test_prefers_ean_when_store_supports_it() -> None:
    q = build_directed_query(
        name="Arroz La Garza Premium",
        display_size="20 Lb",
        ean="7460083780023",
        store_supports_ean=True,
    )
    assert q.by_ean is True
    assert q.text == "7460083780023"


def test_falls_back_to_name_plus_size_when_no_ean_support() -> None:
    q = build_directed_query(
        name="Arroz La Garza Premium",
        display_size="20 Lb",
        ean="7460083780023",
        store_supports_ean=False,
    )
    assert q.by_ean is False
    assert q.text == "Arroz La Garza Premium 20 Lb"


def test_falls_back_to_name_when_no_ean_at_all() -> None:
    q = build_directed_query(
        name="Arroz La Garza Premium",
        display_size="20 Lb",
        ean=None,
        store_supports_ean=True,
    )
    assert q.by_ean is False
    assert q.text == "Arroz La Garza Premium 20 Lb"


def test_omits_missing_size() -> None:
    q = build_directed_query(name="Leche Rica", display_size=None, ean=None, store_supports_ean=False)
    assert q.text == "Leche Rica"


def test_supports_ean_only_vtex() -> None:
    assert supports_ean(SourcePlatform.VTEX) is True
    assert supports_ean(SourcePlatform.MAGENTO) is False
    assert supports_ean(SourcePlatform.REST_CATALOG) is False


def test_does_not_duplicate_size_already_present_in_name() -> None:
    # El name del canónico YA incluye el tamaño → no anexar display_size otra vez (bug live 2026-07-12).
    q = build_directed_query(
        name="Guandules Verdes Con Coco Goya 15.5 Oz",
        display_size="15.5 Oz",
        ean=None,
        store_supports_ean=False,
    )
    assert q.text == "Guandules Verdes Con Coco Goya 15.5 Oz"


def test_dedup_size_is_case_insensitive() -> None:
    q = build_directed_query(
        name="Arroz La Garza 20 LB", display_size="20 Lb", ean=None, store_supports_ean=False
    )
    assert q.text == "Arroz La Garza 20 LB"


def test_supports_directed_query_only_query_capable_platforms() -> None:
    # Directas (búsqueda por término/EAN): VTEX, Magento, Shopify.
    assert supports_directed_query(SourcePlatform.VTEX) is True
    assert supports_directed_query(SourcePlatform.MAGENTO) is True
    assert supports_directed_query(SourcePlatform.SHOPIFY) is True
    # Browse-only (navegan catálogo, ignoran la query) → NO son target de Loop B.
    assert supports_directed_query(SourcePlatform.REST_CATALOG) is False
    assert supports_directed_query(SourcePlatform.AGGREGATOR) is False
    assert supports_directed_query(SourcePlatform.SPA) is False


# ── DirectedCapability: la capacidad como DATO, no como heurística del dominio ─────────────────
# `REST_CATALOG` es un adapter GENÉRICO manejado por profiles: Bravo expone `model.filterByEan`
# (verificado en vivo 2026-07-15), otro súper REST puede no exponer nada. Una PLATAFORMA no puede
# responder por todos sus profiles. Por eso el dominio define el TIPO y deja que infraestructura
# —que sí conoce los profiles— calcule el VALOR.


def test_platform_capability_mirrors_the_platform_heuristics() -> None:
    assert platform_capability(SourcePlatform.VTEX) == DirectedCapability(supported=True, by_ean=True)
    assert platform_capability(SourcePlatform.MAGENTO) == DirectedCapability(
        supported=True, by_ean=False
    )


def test_platform_capability_assumes_browse_only_without_knowing_the_profile() -> None:
    # Default CONSERVADOR: sin conocer el profile hay que asumir que la fuente navega el catálogo.
    # Equivocarse hacia "es dirigida" costaría N navegaciones completas (una por canónico) — el
    # riesgo que motivó el gate browse-only de 2026-07-12. Infraestructura lo sobreescribe si sabe más.
    assert platform_capability(SourcePlatform.REST_CATALOG) == DirectedCapability(
        supported=False, by_ean=False
    )
    assert platform_capability(SourcePlatform.AGGREGATOR).supported is False
    assert platform_capability(SourcePlatform.SPA).supported is False
