"""Unit — la ingesta rellena la marca que la tienda no publica, reconociéndola en el nombre.

Nacional (Magento) y Bravo no exponen marca, así que sus adapters mandan `brand=None`. Este
enganche la resuelve contra el catálogo de marcas conocidas ANTES de persistir, para que llegue
completa a todo lo que viene después: la cola de revisión, el clasificador de categoría y el
canónico que se cree desde ahí.
"""
from __future__ import annotations

from datetime import datetime, timezone

from src.contexts.save.application.refresh_prices import RefreshCatalogPrices
from src.contexts.save.application.resolve_brand import ResolveBrand
from src.contexts.save.domain.entities import PriceType
from src.contexts.save.domain.ports import RawCatalogEntry
from src.shared.money import Currency, Money

DOP = Currency("DOP")


class _FakeBrandCatalog:
    """Sólo lo que `ResolveBrand` necesita del repo de canónicos."""

    def __init__(self, names: list[str]) -> None:
        self.names = names
        self.calls = 0

    def list_brand_names(self, market_id: str) -> list[str]:
        self.calls += 1
        return self.names


class _FakeSource:
    def __init__(self, entries: list[RawCatalogEntry]) -> None:
        self._entries = entries

    def fetch(self):  # type: ignore[no-untyped-def]
        return iter(self._entries)


class _RecordingRepo:
    """Store repo mínimo: recuerda con qué marca se observó cada producto."""

    def __init__(self) -> None:
        self.observed: list[tuple[str, str | None]] = []

    def exists(self, provider_id: str, external_id: str) -> bool:
        return True

    def record_observation(self, **kwargs) -> str:  # type: ignore[no-untyped-def]
        self.observed.append((kwargs["external_id"], kwargs.get("brand")))
        return "sp-1"


def _entry(name: str, brand: str | None, external_id: str = "sku-1") -> RawCatalogEntry:
    return RawCatalogEntry(
        provider_id="p-nacional",
        market_id="DO",
        external_id=external_id,
        name=name,
        brand=brand,
        size_text="10 Lb",
        price=Money(54500, DOP),
        price_type=PriceType.ONLINE,
        source="magento",
    )


def _run(entries: list[RawCatalogEntry], known: list[str]) -> _RecordingRepo:
    repo = _RecordingRepo()
    RefreshCatalogPrices(
        repo, brand_resolver=ResolveBrand(_FakeBrandCatalog(known))
    ).execute(_FakeSource(entries), captured_at=datetime.now(timezone.utc))
    return repo


def test_rellena_la_marca_que_la_tienda_no_publica() -> None:
    repo = _run([_entry("Arroz Enriquecido La Garza 5 Lb", None)], ["LA GARZA", "GOYA"])

    assert repo.observed == [("sku-1", "LA GARZA")]


def test_no_pisa_la_marca_que_la_tienda_SI_publica() -> None:
    """Sirena la trae de verdad; deducirla del nombre por encima sería degradar un dato bueno."""
    repo = _run([_entry("Arroz Enriquecido La Garza 5 Lb", "La Garza Premium")], ["LA GARZA"])

    assert repo.observed == [("sku-1", "La Garza Premium")]


def test_sin_marca_conocida_sigue_diciendo_None_y_no_cadena_vacia() -> None:
    """`None` deja intacta la marca ya guardada; `""` la borraría en cada corrida."""
    repo = _run([_entry("ARROZ SELECTO 10 LB", None)], ["LA GARZA"])

    assert repo.observed == [("sku-1", None)]


def test_el_catalogo_de_marcas_se_lee_UNA_vez_por_corrida_no_por_producto() -> None:
    catalog = _FakeBrandCatalog(["LA GARZA"])
    entries = [
        _entry("Arroz La Garza 5 Lb", None, external_id=f"sku-{i}") for i in range(5)
    ]

    RefreshCatalogPrices(
        _RecordingRepo(), brand_resolver=ResolveBrand(catalog)
    ).execute(_FakeSource(entries), captured_at=datetime.now(timezone.utc))

    assert catalog.calls == 1  # una query, no cinco


def test_sin_resolvedor_el_refresh_funciona_igual() -> None:
    """Colaborador OPCIONAL, como el matcher y el clasificador: sin él, cero regresión."""
    repo = _RecordingRepo()

    RefreshCatalogPrices(repo).execute(
        _FakeSource([_entry("Arroz La Garza 5 Lb", None)]),
        captured_at=datetime.now(timezone.utc),
    )

    assert repo.observed == [("sku-1", None)]
