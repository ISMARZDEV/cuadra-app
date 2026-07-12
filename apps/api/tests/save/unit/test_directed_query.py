"""Unit — consulta dirigida de Loop B (F3.1): cómo buscar un canónico EXACTO en una tienda.

Decisión resuelta (SDD §12.1): EAN primero cuando la tienda soporta búsqueda por barcode (Sirena/
VTEX trae EAN), nombre compuesto (name + display_size) como fallback (Magento busca por término).
PURO — sin red ni DB.
"""
from __future__ import annotations

from src.contexts.save.domain.directed_query import build_directed_query


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
