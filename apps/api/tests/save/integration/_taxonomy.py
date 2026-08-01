"""Helper de fixtures para la taxonomía (Fase 2b).

Desde que el árbol es GLOBAL y la pertenencia a un mercado vive en `taxonomy_node_market`, crear un
nodo visible para un mercado son DOS filas. Antes bastaba `TaxonomyNodeModel(market_id=...)`; ahora
eso ni siquiera compila, y sembrar sólo el concepto deja un nodo que `list_tree(market)` no devuelve
— un fixture que "no hace nada" y un test que falla por la razón equivocada.

`taxonomy_node(session, ...)` acepta los MISMOS kwargs de antes (incluido `market_id`) y se encarga
de las dos. Devuelve el nodo ya flusheado, así que `node.id` está disponible para colgarle hijos.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from src.contexts.save.infrastructure.models import (
    TaxonomyNodeMarketModel,
    TaxonomyNodeModel,
)


def taxonomy_node(session: Session, **kwargs) -> TaxonomyNodeModel:  # type: ignore[no-untyped-def]
    """Nodo de taxonomía + su fila de mercado. `market_id` por defecto "DO"."""
    market_id = kwargs.pop("market_id", "DO")
    node = TaxonomyNodeModel(**kwargs)
    session.add(node)
    session.flush()
    if session.get(TaxonomyNodeMarketModel, (node.id, market_id)) is None:
        session.add(
            TaxonomyNodeMarketModel(node_id=node.id, market_id=market_id, active=True)
        )
        session.flush()
    return node
