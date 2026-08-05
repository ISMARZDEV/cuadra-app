"""Unit — PROCEDENCIA: qué búsqueda de la canasta encontró cada store_product. PURO, sin DB ni red.

Hoy un `store_product` no sabe de qué query salió, y esa ausencia bloquea tres cosas distintas:

1. **Medir el clasificador contra una etiqueta humana.** `basket_query.category_label` es un rubro
   CURADO ("Granos y legumbres"); sin saber qué query trajo el producto no se puede cruzar contra la
   hoja que el clasificador le asignó, así que no hay forma de estimar su acierto sin etiquetar a
   mano.
2. **Saber qué queries son productivas.** Una query que no devuelve nada gasta una request real
   contra la tienda en cada corrida y nadie se entera.
3. **Un eventual portón de rubro en el clasificador.** Deliberadamente NO se implementa todavía: a
   diferencia del portón de departamento (que se ignora si el área queda vacía), un rubro EQUIVOCADO
   fuerza una hoja incorrecta-pero-dentro-del-rubro sobre una correcta-fuera. Puede empeorar, no es
   aditivo, y sin la medición de (1) no hay evidencia para justificarlo.

La procedencia es la BASE de las tres. Se persiste en vez de pasarse en memoria porque Loop B
(`refresh_covered_prices`, re-fetch por `external_id`) y `ClassifyBackfill` reclasifican SIN query:
una pista viva solo dentro del bucle de descubrimiento no llega a ninguno de los dos.

`refresh_source` recibe las queries en una lista PARALELA a `adapters` (no dentro del adapter):
`CatalogSource` es un Protocol de un solo método (`fetch()`) a propósito, y meterle procedencia
obligaría a todos los adapters a cargar algo que solo el descubrimiento por-query tiene — el browse
REST de Bravo itera SECCIONES, no queries de canasta.
"""
from __future__ import annotations

from dataclasses import dataclass

import pytest

from src.contexts.save.application.refresh_prices import RefreshCatalogPrices
from src.contexts.save.domain.entities import PriceType
from src.shared.money import Currency, Money


@dataclass
class _Entry:
    provider_id: str = "p1"
    external_id: str = "sku-1"
    market_id: str = "DO"
    name: str = "Arroz La Garza 5 Lb"
    brand: str | None = "La Garza"
    size_text: str | None = "5 lb"
    ean: str | None = None
    url: str | None = None
    price: Money = Money(45000, Currency('DOP'))
    price_type: PriceType = PriceType.ONLINE
    source: str = "vtex"
    image_urls: tuple[str, ...] = ()
    description: str | None = None
    category_path: tuple[str, ...] = ()
    source_ref: dict | None = None
    is_available: bool = True


class _FakeAdapter:
    def __init__(self, entries: list[_Entry]) -> None:
        self._entries = entries

    def fetch(self):  # type: ignore[no-untyped-def]
        return iter(self._entries)


class _FakeMatcher:
    """Sin matcher, un producto DESCONOCIDO se descarta (legacy F1) y nunca se materializa — o sea
    que el camino que estampa procedencia ni se toca. La cascada activa es el escenario real."""

    def execute(self, incoming):  # type: ignore[no-untyped-def]
        return type("_Outcome", (), {"status": "pending_review"})()


class _FakeStoreRepo:
    """Captura los kwargs de cada `record_observation` para poder afirmar sobre la procedencia."""

    def __init__(self) -> None:
        self.observations: list[dict] = []

    def exists(self, provider_id: str, external_id: str) -> bool:
        return False  # todo producto es NUEVO → camino de alta, que es el que estampa procedencia

    def record_observation(self, **kwargs):  # type: ignore[no-untyped-def]
        self.observations.append(kwargs)
        return f"sp-{len(self.observations)}"


def test_the_query_that_found_a_product_is_recorded_with_it() -> None:
    repo = _FakeStoreRepo()
    RefreshCatalogPrices(repo, matcher=_FakeMatcher()).execute(
        _FakeAdapter([_Entry()]), source_query="arroz la garza"
    )

    assert repo.observations, "no se registró ninguna observación"
    assert repo.observations[0]["source_query"] == "arroz la garza"


def test_without_a_query_the_provenance_is_none_not_invented() -> None:
    """El browse REST de Bravo itera SECCIONES: no hay query de canasta que registrar. Inventar una
    (p.ej. el nombre de la sección) haría que la medición de rubro cruzara contra algo que ningún
    humano curó."""
    repo = _FakeStoreRepo()
    RefreshCatalogPrices(repo, matcher=_FakeMatcher()).execute(_FakeAdapter([_Entry()]))

    assert repo.observations[0]["source_query"] is None


@pytest.mark.parametrize("blank", ["", "   "])
def test_a_blank_query_is_stored_as_none(blank: str) -> None:
    """Cadena vacía y NULL significan lo mismo —'no sé de dónde vino'— y dos representaciones del
    mismo hecho obligan a todo consumidor a comprobar las dos. Se normaliza en la escritura."""
    repo = _FakeStoreRepo()
    RefreshCatalogPrices(repo, matcher=_FakeMatcher()).execute(
        _FakeAdapter([_Entry()]), source_query=blank
    )

    assert repo.observations[0]["source_query"] is None
