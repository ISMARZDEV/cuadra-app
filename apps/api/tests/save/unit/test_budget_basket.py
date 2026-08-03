"""Unit — el use-case `BudgetBasket`: una canasta por proveedor, comparadas entre sí. Sin DB."""
from __future__ import annotations

from src.contexts.save.application.budget_basket import BudgetBasket
from src.contexts.save.domain.basket import ProviderOffer


class _FakeOfferRepo:
    def __init__(self, offers: list[ProviderOffer]) -> None:
        self._offers = offers

    def list_basket_offers(self, market_id: str) -> list[ProviderOffer]:
        return self._offers


def _offer(provider: str, group: str, priority: int, name: str, price: int) -> ProviderOffer:
    return ProviderOffer(
        provider_id=f"id-{provider}",
        provider_name=provider,
        group=group,
        priority=priority,
        canonical_product_id=f"{group}-{name}",
        name=name,
        price_minor=price,
    )


def test_it_builds_one_basket_per_provider() -> None:
    repo = _FakeOfferRepo(
        [
            _offer("Bravo", "Arroz", 1, "arroz bravo", 10_000),
            _offer("Sirena", "Arroz", 1, "arroz sirena", 12_000),
        ]
    )

    result = BudgetBasket(repo).execute(budget_minor=50_000, market_id="DO")

    assert {p.provider_name for p in result.providers} == {"Bravo", "Sirena"}
    assert result.budget_minor == 50_000


def test_the_winner_is_who_covers_more_groups_not_who_spends_least() -> None:
    """Ordenar por total premiaría al que menos compró — que es lo contrario de la pregunta."""
    repo = _FakeOfferRepo(
        [
            _offer("Cubre3", "A", 1, "a", 1_000),
            _offer("Cubre3", "B", 2, "b", 1_000),
            _offer("Cubre3", "C", 3, "c", 1_000),
            _offer("Cubre1", "A", 1, "a barato", 100),
        ]
    )

    result = BudgetBasket(repo).execute(budget_minor=20_000, market_id="DO")

    assert result.providers[0].provider_name == "Cubre3"


def test_a_group_missing_in_one_provider_is_reported_for_that_provider_only() -> None:
    """El universo de rubros sale de TODAS las ofertas: si una tienda no vende algo que la otra sí,
    eso es exactamente el hueco que la comparación tiene que mostrar."""
    repo = _FakeOfferRepo(
        [
            _offer("Completo", "Arroz", 1, "arroz", 1_000),
            _offer("Completo", "Pañales", 2, "pañales", 2_000),
            _offer("Parcial", "Arroz", 1, "arroz", 900),
        ]
    )

    result = BudgetBasket(repo).execute(budget_minor=50_000, market_id="DO")

    parcial = next(p for p in result.providers if p.provider_name == "Parcial")
    completo = next(p for p in result.providers if p.provider_name == "Completo")
    assert parcial.groups_unavailable == ("Pañales",)
    assert completo.groups_unavailable == ()


def test_an_empty_catalog_yields_no_providers_instead_of_crashing() -> None:
    result = BudgetBasket(_FakeOfferRepo([])).execute(budget_minor=50_000, market_id="DO")

    assert result.providers == ()


def test_the_group_priority_is_the_most_essential_of_its_queries() -> None:
    """Un rubro hereda la prioridad MÁS alta de sus queries: lo esencial define el rubro."""
    repo = _FakeOfferRepo(
        [
            _offer("X", "Esencial", 1, "caro", 30_000),
            _offer("X", "Opcional", 9, "barato", 1_000),
        ]
    )

    result = BudgetBasket(repo).execute(budget_minor=30_000, market_id="DO")

    assert [line.group for line in result.providers[0].lines] == ["Esencial"]
