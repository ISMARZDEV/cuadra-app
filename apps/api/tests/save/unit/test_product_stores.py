"""Unit — ListProductStores: el panel PÚBLICO de «otras tiendas» del detalle de producto.

Es el gemelo público de «Proveedores matcheados» del admin, y lee LA MISMA consulta
(`list_providers`) a propósito: dos consultas distintas para el mismo panel acabarían dando
números distintos, que es exactamente el defecto que el admin ya documentó en `provider-stats.ts`
(el tile decía RD$76.00, la fila RD$75.00 y la diferencia RD$1.00 — tres números que no cerraban).

Lo que este use case SÍ decide es qué se publica: la fila del admin arrastra datos de auditoría
(nombre en la tienda, descripción, todas las imágenes, el id del store_product) que no tienen por
qué salir a una app pública.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from src.contexts.save.application.errors import CanonicalProductNotFoundError
from src.contexts.save.application.product_stores import ListProductStores
from src.contexts.save.domain.canonical_catalog import CanonicalProviderPriceRow
from src.contexts.save.domain.entities import CanonicalProduct
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure

from decimal import Decimal

NOW = datetime(2026, 8, 5, 2, 48, tzinfo=timezone.utc)


def _q() -> Quantity:
    return Quantity(Decimal("10"), UnitMeasure.MASS)


def _row(pid: str, name: str, minor: int, **kw) -> CanonicalProviderPriceRow:  # noqa: ANN003
    return CanonicalProviderPriceRow(
        provider_id=pid,
        provider_name=name,
        store_product_id=f"sp-{pid}",
        price_minor=minor,
        currency="DOP",
        **kw,
    )


class FakeCanonicalRepo:
    def __init__(self, products: list[CanonicalProduct]) -> None:
        self._by_slug = {p.slug: p for p in products if p.slug}
        self._by_id = {p.id: p for p in products}

    def get_by_slug(self, slug: str, market_id: str) -> CanonicalProduct | None:
        return self._by_slug.get(slug)

    def get_by_id(self, product_id: str) -> CanonicalProduct | None:
        return self._by_id.get(product_id)


class FakeCatalogRepo:
    def __init__(self, rows: dict[str, list[CanonicalProviderPriceRow]]) -> None:
        self._rows = rows

    def list_providers(self, canonical_product_id: str) -> list[CanonicalProviderPriceRow]:
        return self._rows.get(canonical_product_id, [])


ARROZ = CanonicalProduct("c1", "Arroz Selecto", "Líder", _q(), "n-arroz", "DO", slug="arroz-selecto")


def _use_case(rows: list[CanonicalProviderPriceRow]) -> ListProductStores:
    return ListProductStores(FakeCanonicalRepo([ARROZ]), FakeCatalogRepo({"c1": rows}))


def test_publishes_the_trust_signals_the_panel_needs() -> None:
    """Logo, precio anterior y CUÁNDO se vio: las tres que `/save/compare` no lleva."""
    uc = _use_case([
        _row("sirena", "Sirena", 16900, provider_logo_url="/l/sirena.png",
             last_seen_at=NOW, is_cheapest=True, price_type="online"),
    ])

    [fila] = uc.execute("arroz-selecto", "DO")

    assert fila.provider_name == "Sirena"
    assert fila.provider_logo_url == "/l/sirena.png"
    assert fila.price_minor == 16900
    assert fila.last_seen_at == NOW
    assert fila.price_type == "online"
    assert fila.is_cheapest is True


def test_extra_vs_cheapest_is_computed_on_the_server() -> None:
    """«+RD$10.00» sale del SERVIDOR, no de restar en la UI: la fila y el tile deben cerrar."""
    uc = _use_case([
        _row("sirena", "Sirena", 16900, is_cheapest=True),
        _row("bravo", "Bravo", 17900),
    ])

    filas = uc.execute("arroz-selecto", "DO")

    assert [f.extra_minor for f in filas] == [0, 1000]


def test_previous_price_is_absent_when_the_store_never_moved_it() -> None:
    """`None` es lo que APAGA el tachado. Un 0 encendería un tachado de «RD$0.00»."""
    uc = _use_case([_row("sirena", "Sirena", 16900)])

    assert uc.execute("arroz-selecto", "DO")[0].previous_price_minor is None


def test_does_not_leak_the_admin_audit_fields() -> None:
    """La fila del admin arrastra auditoría interna. Publicarla sería filtrar por accidente."""
    uc = _use_case([
        _row("sirena", "Sirena", 16900,
             store_product_name="ARROZ SELECTO LIDER 10LB",
             store_product_description="prosa comercial de la tienda",
             store_product_image_urls=["/a.jpg", "/b.jpg"]),
    ])

    publicado = uc.execute("arroz-selecto", "DO")[0].model_dump()

    for interno in ("store_product_id", "store_product_name", "store_product_description",
                    "store_product_image_urls", "store_product_brand"):
        assert interno not in publicado


def test_resolves_by_uuid_too_permalink_pattern() -> None:
    """Mismo patrón que `/save/compare`: slug legible primero, UUID de reserva."""
    uc = _use_case([_row("sirena", "Sirena", 16900)])

    assert len(uc.execute("c1", "DO")) == 1


def test_unknown_product_raises_not_found() -> None:
    """Devolver [] haría indistinguible «no tiene tiendas» de «ese producto no existe»."""
    uc = _use_case([])

    with pytest.raises(CanonicalProductNotFoundError):
        uc.execute("no-existe", "DO")
