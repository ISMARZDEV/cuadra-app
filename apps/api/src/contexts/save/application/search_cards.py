"""Buscar y devolver TARJETAS de producto (con precio), no sólo nombres."""

from __future__ import annotations

from typing import Protocol

from ..domain.ports import StoreProductRepository
from .dtos import ProductCardPageDto
from .listing import _aggregate, _to_card


class ProductRanking(Protocol):
    """Lo ÚNICO que este caso de uso necesita de la búsqueda: ids en orden de relevancia.

    Se declara como puerto y no se importa `SearchProducts` directamente para no atarse a su forma:
    aquí da igual si el ranking es léxico, semántico o la fusión de ambos.
    """

    def rank(self, query: str, market_id: str) -> list[str]: ...


class SearchProductCards:
    """Búsqueda con TARJETAS: el ranking híbrido cruzado con la oferta vigente del mercado.

    Existe aparte de `SearchProducts` en vez de reformarlo porque aquél devuelve `ProductSearchDto`
    (id/slug/nombre/marca) y lo comparten la web y el typeahead del chat — que justamente NO quiere
    precios ni imágenes. Reformarlo habría hecho más caro el typeahead para beneficiar a otra
    pantalla.

    El ORDEN es lo que hace útil a una búsqueda, así que manda el del ranking y no el del catálogo:
    el cruce con la oferta filtra, nunca reordena.
    """

    def __init__(self, ranking: ProductRanking, store_repo: StoreProductRepository) -> None:
        self._ranking = ranking
        self._store = store_repo

    def execute(
        self, query: str, market_id: str, *, limit: int = 24, offset: int = 0
    ) -> ProductCardPageDto:
        text = query.strip()
        # Una consulta en blanco no se le pregunta a nadie: el ranking híbrido cuesta una consulta
        # léxica MÁS una de embeddings, y devolver «todo» tampoco sería una búsqueda.
        if not text:
            return ProductCardPageDto(items=[], total=0)

        ranked_ids = self._ranking.rank(text, market_id)
        products = _aggregate(self._store.list_market_offerings(market_id))

        # El índice de búsqueda puede ir por delante del catálogo vigente: un id que ya no está en
        # la oferta se descarta EN SILENCIO (mismo criterio que las ofertas del día). Y el total se
        # cuenta sobre los que SOBREVIVEN — con los ids crudos, el cliente pediría páginas vacías.
        cards = [_to_card(products[pid]) for pid in ranked_ids if pid in products]
        return ProductCardPageDto(items=cards[offset : offset + limit], total=len(cards))
