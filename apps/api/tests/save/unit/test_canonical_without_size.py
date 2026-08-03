"""Unit — un canónico SIN tamaño se puede volver a leer.

PR #45 hizo legítimo el canónico sin tamaño (un plato preparado, un pan por pieza), y la entidad
lo declara: `quantity: Quantity | None`. El repo ESCRIBE `None` y la columna en la base es
nullable. Pero el mapper hacía `UnitMeasure(m.size_measure)` sin guarda, así que el producto se
guardaba bien y REVENTABA al leerlo. Cero filas así en dev — por eso nadie lo vio.
"""
from __future__ import annotations

import uuid

from src.contexts.save.infrastructure.mappers import canonical_to_entity
from src.contexts.save.infrastructure.models import CanonicalProductModel


def _model(**over: object) -> CanonicalProductModel:
    defaults: dict = {
        "id": uuid.uuid4(),
        "name": "Sándwich De Pollo Del Mostrador",
        "size_amount": None,
        "size_measure": None,
        "taxonomy_node_id": uuid.uuid4(),
        "market_id": "DO",
    }
    return CanonicalProductModel(**{**defaults, **over})


def test_a_canonical_without_size_maps_to_quantity_none() -> None:
    entity = canonical_to_entity(_model(), "Mostrador")

    assert entity.quantity is None
    assert entity.name == "Sándwich De Pollo Del Mostrador"


def test_a_canonical_with_size_still_maps_its_quantity() -> None:
    from decimal import Decimal

    from src.contexts.save.domain.value_objects import UnitMeasure

    entity = canonical_to_entity(
        _model(size_amount=Decimal("4.5359237"), size_measure="mass"), "La Garza"
    )

    assert entity.quantity is not None
    assert entity.quantity.measure is UnitMeasure.MASS
