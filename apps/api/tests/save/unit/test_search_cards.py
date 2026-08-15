"""Unit — SearchProductCards: buscar y devolver TARJETAS (con precio), no sólo nombres.

`/save/search` devuelve `ProductSearchDto` (id/slug/nombre/marca), que alcanza para el typeahead del
chat y para la página de resultados de la web pero NO para pintar una tarjeta de producto: le falta
precio, imagen y en cuántas tiendas está.

Ese endpoint NO se puede reformar — lo comparten la web y el typeahead, y el typeahead justamente no
quiere precios. Así que la búsqueda con tarjetas es un caso de uso APARTE que reutiliza el ranking
híbrido ya existente y lo cruza con la oferta vigente del mercado.
"""
from __future__ import annotations

from src.contexts.save.application.listing import OfferingRow
from src.contexts.save.application.search_cards import SearchProductCards
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure
from src.shared.money import Currency, Money

DOP = Currency("DOP")


def _row(pid: str, name: str, provider: str, price_minor: int) -> OfferingRow:
    return OfferingRow(
        product_id=pid,
        name=name,
        brand="LA FAMOSA",
        slug=f"{pid}-slug",
        quality=None,
        display_size="1 kg",
        image_url=None,
        provider_id=provider,
        provider_name=provider,
        price=Money(price_minor, DOP),
        quantity=Quantity(1, UnitMeasure.MASS),
    )


MARKET_ROWS = [
    _row("salsa", "Salsa La Famosa", "p1", 7400),
    _row("salsa", "Salsa La Famosa", "p2", 8000),
    _row("arroz", "Arroz Selecto", "p1", 4600),
    _row("leche", "Leche Rica", "p1", 9900),
]


class FakeRanking:
    """El ranking híbrido ya existente. Sólo importa QUÉ ids devuelve y EN QUÉ ORDEN."""

    def __init__(self, ranked_ids: list[str]) -> None:
        self.ranked_ids = ranked_ids
        self.seen: list[tuple[str, str]] = []

    def rank(self, query: str, market_id: str) -> list[str]:
        self.seen.append((query, market_id))
        return self.ranked_ids


class FakeStore:
    def __init__(self, rows: list[OfferingRow]) -> None:
        self._rows = rows

    def list_market_offerings(self, market_id: str) -> list[OfferingRow]:
        return self._rows


def _uc(ranked: list[str], rows: list[OfferingRow] | None = None) -> SearchProductCards:
    return SearchProductCards(FakeRanking(ranked), FakeStore(MARKET_ROWS if rows is None else rows))


def test_devuelve_tarjetas_con_precio_no_solo_nombres() -> None:
    page = _uc(["salsa"]).execute("salsa", "DO")

    assert len(page.items) == 1
    card = page.items[0]
    assert card.id == "salsa"
    assert card.price_minor == 7400  # el mínimo entre tiendas
    assert card.store_count == 2


def test_conserva_el_orden_DEL_RANKING_no_el_del_catalogo() -> None:
    """Lo que hace útil a una búsqueda es el orden. Si el cruce con la oferta lo pierde, el mejor
    resultado puede acabar tercero y la búsqueda deja de servir."""
    page = _uc(["leche", "salsa", "arroz"]).execute("lo que sea", "DO")

    assert [c.id for c in page.items] == ["leche", "salsa", "arroz"]


def test_un_resultado_que_ya_no_esta_en_la_oferta_se_descarta_en_silencio() -> None:
    """Mismo criterio que las ofertas del día: el índice de búsqueda puede ir por delante del
    catálogo vigente. Que un producto haya salido de la oferta no es un error que anunciar."""
    page = _uc(["salsa", "fantasma"]).execute("salsa", "DO")

    assert [c.id for c in page.items] == ["salsa"]


def test_total_cuenta_los_que_SOBREVIVEN_al_cruce() -> None:
    """Si contara los ids crudos del ranking, el cliente pediría páginas que no existen."""
    page = _uc(["salsa", "fantasma", "otro-fantasma"]).execute("salsa", "DO")

    assert page.total == 1


def test_pagina_con_offset() -> None:
    page = _uc(["leche", "salsa", "arroz"]).execute("x", "DO", limit=1, offset=1)

    assert [c.id for c in page.items] == ["salsa"]
    assert page.total == 3


def test_offset_pasado_el_final_devuelve_vacio_sin_romper() -> None:
    page = _uc(["salsa"]).execute("salsa", "DO", offset=99)

    assert page.items == []
    assert page.total == 1


def test_consulta_vacia_no_busca_ni_devuelve_nada() -> None:
    ranking = FakeRanking(["salsa"])
    uc = SearchProductCards(ranking, FakeStore(MARKET_ROWS))

    page = uc.execute("   ", "DO")

    assert page.items == []
    assert page.total == 0
    # No se molesta al ranking por una consulta en blanco.
    assert ranking.seen == []


def test_le_pasa_al_ranking_la_consulta_y_el_mercado() -> None:
    ranking = FakeRanking([])
    SearchProductCards(ranking, FakeStore(MARKET_ROWS)).execute("  salsa  ", "DO")

    assert ranking.seen == [("salsa", "DO")]
