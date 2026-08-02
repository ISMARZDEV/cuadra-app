"""Integration — `seeds.reopen_ean_testbed`: el banco de prueba de la etapa EAN.

Por qué existe (2026-08-02): un re-match sobre 46 filas de la cola enlazó UNA, y hubo que medir para
descartar que la etapa EAN estuviera rota. No lo estaba: la etapa necesita una CONTRAPARTE (otro
`store_product` con el mismo EAN ya enlazado) y 28 de los 32 EAN de esa tienda eran exclusivos suyos.

Este seed arma la prueba de forma repetible. Los dos tests fijan lo que puede romperla en silencio:
que seleccione filas SIN contraparte (la prueba no probaría nada), y que desenlace a medias (daría
un FALSO VERDE, porque el producto quedaría siendo su propio puente).
"""
from __future__ import annotations

import uuid
from decimal import Decimal

from seeds.reopen_ean_testbed import find_candidates, run
from src.contexts.save.domain.entities import (
    CanonicalProduct,
    Provider,
    ProviderType,
    SourcePlatform,
)
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure
from src.contexts.save.infrastructure.matching.repository.product_match_repository import (
    SqlProductMatchRepository,
)
from src.contexts.save.infrastructure.models import ProductMatchModel, StoreProductModel
from src.contexts.save.infrastructure.repositories import (
    SqlCanonicalProductRepository,
    SqlProviderRepository,
)
from tests.save.integration._taxonomy import taxonomy_node

def _ean_sintetico() -> str:
    """EAN único por corrida. NO usar uno real: estos tests corren contra la base de DESARROLLO
    dentro de una transacción que se revierte, así que aíslan lo que ESCRIBEN, no lo que ya había —
    un EAN real ya tiene contraparte en los datos vivos y la aserción de "sin contraparte" fallaría
    por la base, no por el código."""
    return f"99{uuid.uuid4().int % 10**12:012d}"


def _uuid() -> str:
    return str(uuid.uuid4())


def _provider(db_session, name: str) -> str:  # type: ignore[no-untyped-def]
    pid = _uuid()
    SqlProviderRepository(db_session).add(
        Provider(pid, name, ProviderType.SUPERMARKET, SourcePlatform.VTEX, "DO")
    )
    return pid


def _canonical(db_session) -> str:  # type: ignore[no-untyped-def]
    node = taxonomy_node(db_session, name="Arroz", level=0, market_id="DO")
    db_session.add(node)
    db_session.flush()
    cid = _uuid()
    SqlCanonicalProductRepository(db_session).add(
        CanonicalProduct(
            cid, "Fideo De Arroz Okayama", "Okayama",
            Quantity(Decimal("0.454"), UnitMeasure.MASS),
            taxonomy_node_id=str(node.id), market_id="DO",
        )
    )
    return cid


def _linked_product(db_session, provider_id: str, canonical_id: str, ean: str | None) -> str:  # type: ignore[no-untyped-def]
    """Un `store_product` ENLAZADO: FK puesto + `product_match` en `auto_linked`."""
    sp = StoreProductModel(
        provider_id=uuid.UUID(provider_id),
        canonical_product_id=uuid.UUID(canonical_id),
        external_id=f"sku-{uuid.uuid4().hex[:8]}",
        current_price_minor=12500,
        currency="DOP",
        name="FIDEO DE ARROZ 454GR",
        ean=ean,
    )
    db_session.add(sp)
    db_session.flush()
    SqlProductMatchRepository(db_session).record_match(
        store_product_id=str(sp.id), canonical_product_id=canonical_id,
        confidence=1.0, method="ean", status="auto_linked",
    )
    return str(sp.id)


def _estado(db_session, store_product_id: str):  # type: ignore[no-untyped-def]
    sp = db_session.get(StoreProductModel, uuid.UUID(store_product_id))
    match = (
        db_session.query(ProductMatchModel)
        .filter(ProductMatchModel.store_product_id == uuid.UUID(store_product_id))
        .one()
    )
    return sp.canonical_product_id, match.status


def test_solo_selecciona_lo_que_TIENE_contraparte_enlazada(db_session) -> None:  # type: ignore[no-untyped-def]
    """Un EAN exclusivo de su tienda NO puede volver por EAN: incluirlo haría que la prueba
    'fallara' por una razón que no es un defecto de la etapa."""
    canonical = _canonical(db_session)
    con_par = _provider(db_session, f"ConPar-{uuid.uuid4().hex[:6]}")
    puente = _provider(db_session, f"Puente-{uuid.uuid4().hex[:6]}")
    solo = _provider(db_session, f"Solo-{uuid.uuid4().hex[:6]}")

    compartido = _ean_sintetico()
    objetivo = _linked_product(db_session, con_par, canonical, compartido)
    _linked_product(db_session, puente, canonical, compartido)  # la contraparte
    exclusivo = _linked_product(db_session, solo, canonical, _ean_sintetico())

    seleccionados = {f.spid for f in find_candidates(db_session)}

    assert objetivo in seleccionados
    assert exclusivo not in seleccionados


def test_desenlaza_LAS_DOS_puntas_y_deja_intacta_la_contraparte(db_session) -> None:  # type: ignore[no-untyped-def]
    """La invariante que evita el FALSO VERDE.

    `reopen_review` a secas limpiaría el canónico del match pero dejaría
    `store_product.canonical_product_id` puesto — y la etapa EAN mira ESE campo, así que el producto
    sería su PROPIO puente y volvería a enlazarse sin probar nada. Por eso el seed usa
    `UnlinkStoreProduct`, que limpia ambas en la misma UoW.
    """
    canonical = _canonical(db_session)
    nombre_objetivo = f"Objetivo-{uuid.uuid4().hex[:6]}"
    objetivo_prov = _provider(db_session, nombre_objetivo)
    puente_prov = _provider(db_session, f"Puente-{uuid.uuid4().hex[:6]}")

    compartido = _ean_sintetico()
    objetivo = _linked_product(db_session, objetivo_prov, canonical, compartido)
    puente = _linked_product(db_session, puente_prov, canonical, compartido)

    run(db_session, execute=True, provider_name=nombre_objetivo)

    fk_objetivo, status_objetivo = _estado(db_session, objetivo)
    assert fk_objetivo is None, "el FK del store_product quedó puesto → sería su propio puente"
    assert status_objetivo == "pending_review"

    # El puente NO se toca: sin él la etapa EAN no tendría contra qué enlazar.
    fk_puente, status_puente = _estado(db_session, puente)
    assert fk_puente is not None
    assert status_puente == "auto_linked"


def test_escribir_SIN_acotar_a_una_tienda_esta_prohibido(db_session) -> None:  # type: ignore[no-untyped-def]
    """En un par que comparte EAN cada lado es la contraparte del otro: desenlazar sin acotar se
    lleva LAS DOS PUNTAS y no queda puente contra el cual re-enlazar. El banco quedaría inservible
    y el fallo se vería como "la etapa EAN no funciona", que es la conclusión opuesta a la real."""
    import pytest

    with pytest.raises(ValueError, match="--provider"):
        run(db_session, execute=True)
