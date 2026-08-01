"""Integration — una marca desconocida (`None`) nunca pisa la que ya se conoce. Requiere DB.

Vive en `integration/` y no en `unit/` porque toca la base: el marcado es por RUTA
(`tests/conftest.py`), y CI corre `pytest -m "not integration"` ANTES de `alembic upgrade head`.
Un test con `db_session` colgado de `unit/` pasa en local —donde el esquema ya existe— y revienta
en CI con `relation "save.provider" does not exist`.

El invariante: `record_observation` protege los atributos crudos con `if brand is not None`, pero
los adapters mandaban `""`, que PASA ese filtro. Así, cada corrida de ingesta borraba en silencio
cualquier marca resuelta por otra vía.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from src.contexts.save.domain.entities import (
    PriceType,
    Provider,
    ProviderType,
    SourcePlatform,
)
from src.contexts.save.infrastructure.models import StoreProductModel
from src.contexts.save.infrastructure.repositories import (
    SqlProviderRepository,
    SqlStoreProductRepository,
)
from src.shared.money import Currency, Money


def test_an_unknown_brand_never_overwrites_one_already_known(db_session) -> None:  # type: ignore[no-untyped-def]
    pid = str(uuid.uuid4())
    SqlProviderRepository(db_session).add(
        Provider(pid, "Bravo", ProviderType.SUPERMARKET, SourcePlatform.REST_CATALOG, "DO")
    )
    repo = SqlStoreProductRepository(db_session)
    common = {
        "provider_id": pid, "external_id": "sku-1", "canonical_product_id": None,
        "price": Money(54500, Currency("DOP")), "captured_at": datetime.now(timezone.utc),
        "price_type": PriceType.ONLINE, "source": "bravova",
    }

    sp_id = repo.record_observation(**common, name="LA GARZA ARROZ 10 LB", brand="LA GARZA")
    repo.record_observation(**common, name="LA GARZA ARROZ 10 LB", brand=None)

    assert db_session.get(StoreProductModel, uuid.UUID(sp_id)).brand == "LA GARZA"
