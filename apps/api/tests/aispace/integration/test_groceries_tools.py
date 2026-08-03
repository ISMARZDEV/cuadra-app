"""Integration — las tools del GroceriesAgent contra la DB real. Sin LLM.

Verifican el CONTRATO, que es donde se juega el grounding (§5.5, §8):
  - todo número sale de Postgres ya formateado — el modelo no recibe enteros crudos que
    «ayudar a redondear»,
  - `market_id` NUNCA es parámetro visible al LLM: se liga por closure,
  - la degradación es HONESTA: un producto en UNA sola tienda se reporta como tal, jamás como
    «el más barato» (afirmación comparativa falsa cuando no hay con qué comparar),
  - la salida es texto compacto en inglés NEUTRO: no ancla el idioma de la respuesta.
"""
from __future__ import annotations

import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from src.contexts.aispace.agents.groceries.tools.basket import (
    build_basket_for_budget,
    build_monthly_cost,
)
from src.contexts.aispace.agents.groceries.tools.catalog import (
    build_cheapest_store_by_category,
    build_compare_prices,
    build_explore_alternatives,
    build_search_groceries,
)
from src.contexts.save.domain.entities import (
    CanonicalProduct,
    PriceType,
    Provider,
    ProviderType,
    SourcePlatform,
)
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure
from src.contexts.save.infrastructure.repositories import (
    SqlCanonicalProductRepository,
    SqlProviderRepository,
    SqlStoreProductRepository,
)
from src.shared.money import Currency, Money

from ...save.integration._taxonomy import taxonomy_node

DOP = Currency("DOP")
MARKET = "DO"


def _factory(session: Session):  # type: ignore[no-untyped-def]
    @contextmanager
    def _f():  # type: ignore[no-untyped-def]
        yield session

    return _f


def _seed_product(
    db: Session,
    *,
    name: str,
    brand: str,
    prices: dict[str, int],
    category: str = "Aceites",
    with_size: bool = True,
) -> str:
    """Un canónico con nombre irrepetible, presente en las tiendas de `prices`.

    `with_size=False` es un canónico SIN tamaño declarado — legítimo desde PR #45 (un plato
    preparado, un pan por pieza). Sin él no se puede ejercitar la fila 4 de §8.1.
    """
    node = taxonomy_node(db, name=category, level=0, market_id=MARKET)
    db.add(node)
    db.flush()
    cid = str(uuid.uuid4())
    SqlCanonicalProductRepository(db).add(
        CanonicalProduct(
            cid,
            name,
            brand,
            Quantity(Decimal("1"), UnitMeasure.VOLUME) if with_size else None,
            taxonomy_node_id=str(node.id),
            market_id=MARKET,
            display_size="1 Lt" if with_size else None,
        )
    )
    store = SqlStoreProductRepository(db)
    providers = SqlProviderRepository(db)
    for provider_name, price_minor in prices.items():
        pid = str(uuid.uuid4())
        providers.add(
            Provider(
                pid, provider_name, ProviderType.SUPERMARKET, SourcePlatform.VTEX, MARKET
            )
        )
        store.record_observation(
            provider_id=pid,
            external_id=f"tool-test-{uuid.uuid4()}",
            canonical_product_id=cid,
            price=Money(price_minor, DOP),
            captured_at=datetime.now(timezone.utc),
            price_type=PriceType.ONLINE,
            source="test",
            url=f"https://{provider_name.lower()}.example/p",
        )
    return cid


class TestGrounding:
    def test_compare_prices_returns_formatted_money_never_raw_integers(
        self, db_session: Session
    ) -> None:
        _seed_product(
            db_session,
            name="Aceite Zumbaquisqueya Extra Virgen 1 Lt",
            brand="ZUMBAQUISQUEYA",
            prices={"TiendaUno": 89_500, "TiendaDos": 95_000},
        )
        tool = build_compare_prices(_factory(db_session), MARKET)

        out = tool.invoke({"product": "zumbaquisqueya"})

        assert "895.00" in out          # formateado por Money.format(), no 89500
        assert "89500" not in out       # el entero crudo NUNCA llega al modelo

    def test_compare_prices_cites_the_store_and_the_capture_date(
        self, db_session: Session
    ) -> None:
        _seed_product(
            db_session,
            name="Aceite Zumbaquisqueya Extra Virgen 1 Lt",
            brand="ZUMBAQUISQUEYA",
            prices={"TiendaUno": 89_500, "TiendaDos": 95_000},
        )
        tool = build_compare_prices(_factory(db_session), MARKET)

        out = tool.invoke({"product": "zumbaquisqueya"})

        assert "TiendaUno" in out and "TiendaDos" in out
        assert "captured" in out.lower()
        assert "online" in out.lower()   # el price_type se declara (§8.2)

    def test_a_product_in_ONE_store_is_never_called_the_cheapest(
        self, db_session: Session
    ) -> None:
        """§8.1 — «tiene el mejor precio» con una sola opción es una afirmación falsa."""
        _seed_product(
            db_session,
            name="Aceite Solitario Unicornio 1 Lt",
            brand="UNICORNIO",
            prices={"TiendaSola": 50_000},
        )
        tool = build_compare_prices(_factory(db_session), MARKET)

        out = tool.invoke({"product": "unicornio"})

        assert "only" in out.lower()          # «found at only ONE store»
        assert "cheapest" not in out.lower()

    def test_a_product_that_does_not_exist_says_so_instead_of_inventing(
        self, db_session: Session
    ) -> None:
        tool = build_compare_prices(_factory(db_session), MARKET)

        out = tool.invoke({"product": "flux capacitor de plutonio"})

        assert "no_match" in out


class TestDegradacionHonesta:
    """§8.1 — cada fila de la tabla de degradación, con su test. Fase 7.

    La regla que las une: cuando falta un dato, se DICE. Inventarlo es el peor bug posible de este
    agente, y callarlo es la versión educada del mismo bug.
    """

    def test_no_tool_offers_price_history_because_there_is_none(
        self, db_session: Session
    ) -> None:
        """§8.1 fila 3 — sin superficie no hay alucinación.

        Hay **1 solo snapshot** de precios: una tool de historial devolvería una serie de un punto
        y el modelo hablaría de tendencias que no existen. La mitigación no es un prompt pidiendo
        prudencia — es que la tool NO EXISTA. Este test es lo que impide que alguien la agregue
        antes de que haya historial de verdad.
        """
        factory = _factory(db_session)
        tools = [
            build_search_groceries(factory, MARKET),
            build_compare_prices(factory, MARKET),
            build_explore_alternatives(factory, MARKET),
            build_cheapest_store_by_category(factory, MARKET),
            build_basket_for_budget(factory, MARKET),
            build_monthly_cost(factory, MARKET),
        ]
        prohibited = ("history", "historial", "trend", "evolution", "over_time", "price_drop")

        for tool in tools:
            for word in prohibited:
                assert word not in tool.name.lower(), f"{tool.name} promete historial"

    def test_a_product_without_size_omits_the_unit_price_instead_of_printing_zero(
        self, db_session: Session
    ) -> None:
        """§8.1 fila 4 — un canónico sin tamaño es legítimo (PR #45); `RD$0.00/kg` es una MENTIRA.

        Un cero impreso no se lee como «no sé»: se lee como «gratis por kilo». Omitir es honesto.
        """
        _seed_product(
            db_session,
            # Nombre sin NINGÚN token del catálogo real: la primera versión decía «Sándwich De
            # Pollo Del Mostrador» y el resolver se quedó con un demo de la base, no con el
            # sembrado. Un test de integración que compite con datos reales no prueba nada.
            name="Zzqwx Kkwr Producto Sin Tamano",
            brand="Zzqwx",
            prices={"Sirena": 18_500, "Nacional": 19_900},
            with_size=False,
        )
        tool = build_compare_prices(_factory(db_session), MARKET)

        out = tool.invoke({"product": "Zzqwx Kkwr Producto Sin Tamano"})

        assert "Zzqwx" in out, "resolvió a otro producto: el test no está midiendo lo que dice"
        assert "unit_price" not in out, "inventó un precio por unidad sin tamaño declarado"
        assert "0.00/" not in out, "imprimió un precio por unidad en cero"

    def test_a_budget_that_buys_nothing_says_how_much_is_missing(
        self, db_session: Session
    ) -> None:
        """§8.1 fila 6 — «no te alcanza» sin decir cuánto falta no le sirve a nadie."""
        tool = build_basket_for_budget(_factory(db_session), MARKET)

        out = tool.invoke({"amount": 1})

        assert "short_by=" in out, "no dice cuánto falta"
        assert "did_not_fit=" in out, "no dice qué rubros quedaron fuera"
        assert "items=0" in out


class TestLaToolStageaLaTarjeta:
    """La tool entrega los DATOS de la comparación; el chrome lo pone el cliente (§4.3 revisado).

    El enlace externo se descartó: mandar al navegador abandona la conversación. La comparación
    se pinta dentro de la burbuja, así que la tool tiene que stagear la tabla entera.
    """

    def test_search_groceries_stages_provider_products_carousel(
        self, db_session: Session
    ) -> None:
        staging: dict = {}
        _seed_product(
            db_session,
            name="Zzqwx Carrusel Producto Unico",
            brand="Zzqwx",
            prices={"Sirena": 21_500, "Nacional": 22_900},
        )
        tool = build_search_groceries(_factory(db_session), MARKET, staging)

        out = tool.invoke({"query": "Zzqwx Carrusel"})

        assert "Zzqwx" in out
        assert "provider_products" in staging
        [action] = staging["provider_products"]
        assert action["type"] == "provider_products"
        assert action["currency"] == "DOP"
        provider_names = {p["provider_name"] for p in action["providers"]}
        assert provider_names == {"Sirena", "Nacional"}
        sirena = next(p for p in action["providers"] if p["provider_name"] == "Sirena")
        assert len(sirena["items"]) == 1
        item = sirena["items"][0]
        assert item["index"] == 1
        assert item["name"] == "Zzqwx Carrusel Producto Unico"
        # El dinero sale formateado, nunca como entero crudo.
        assert "215.00" in item["unit_price"]
        assert not isinstance(item["unit_price"], int)

    def test_compare_prices_stages_the_card_with_one_row_per_store(
        self, db_session: Session
    ) -> None:
        staging: dict = {}
        _seed_product(
            db_session,
            name="Zzqwx Tarjeta Producto Kkwr",
            brand="Zzqwx",
            prices={"Sirena": 21_500, "Nacional": 22_900},
        )
        tool = build_compare_prices(_factory(db_session), MARKET, staging)

        out = tool.invoke({"product": "Zzqwx Tarjeta Producto Kkwr"})

        assert "Zzqwx" in out, "resolvió a otro producto: el test no mide lo que dice"
        card = staging["product"]
        assert "Zzqwx" in card["name"]
        assert {s["provider"] for s in card["stores"]} == {"Sirena", "Nacional"}

    def test_the_staged_prices_are_FORMATTED_never_raw_integers(
        self, db_session: Session
    ) -> None:
        # Misma regla que hacia el modelo (§5.5): un entero es una invitación a redondearlo.
        staging: dict = {}
        _seed_product(
            db_session,
            name="Zzqwx Formato Producto Kkwr",
            brand="Zzqwx",
            prices={"Sirena": 21_500},
        )
        tool = build_compare_prices(_factory(db_session), MARKET, staging)

        tool.invoke({"product": "Zzqwx Formato Producto Kkwr"})

        [row] = staging["product"]["stores"]
        assert "215" in row["price"] and not isinstance(row["price"], int)

    def test_a_product_in_ONE_store_is_not_flagged_cheapest_in_the_card(
        self, db_session: Session
    ) -> None:
        """§8.1 fila 2 otra vez, ahora en la UI: la tarjeta tampoco puede afirmarlo."""
        staging: dict = {}
        _seed_product(
            db_session,
            name="Zzqwx Unica Tienda Kkwr",
            brand="Zzqwx",
            prices={"Sirena": 21_500},
        )
        tool = build_compare_prices(_factory(db_session), MARKET, staging)

        tool.invoke({"product": "Zzqwx Unica Tienda Kkwr"})

        from src.contexts.aispace.agents.groceries.tools._shared import product_action

        [action] = product_action(staging["product"])
        assert action["stores"][0]["is_cheapest"] is False

    def test_without_a_staging_channel_it_still_answers(self, db_session: Session) -> None:
        # El canal es OPCIONAL: los tests y los evals construyen la tool sin él.
        tool = build_compare_prices(_factory(db_session), MARKET)

        assert "no_match" in tool.invoke({"product": "flux capacitor de plutonio"})


class TestAntiIdorYContrato:
    def test_no_tool_exposes_market_id_to_the_model(self, db_session: Session) -> None:
        """El mercado se liga por closure: el modelo no puede pedir el catálogo de otro país."""
        factory = _factory(db_session)
        tools = [
            build_search_groceries(factory, MARKET),
            build_compare_prices(factory, MARKET),
            build_explore_alternatives(factory, MARKET),
            build_cheapest_store_by_category(factory, MARKET),
            build_basket_for_budget(factory, MARKET),
            build_monthly_cost(factory, MARKET),
        ]

        for tool in tools:
            assert "market" not in tool.args, f"{tool.name} expone market al LLM"
            assert "market_id" not in tool.args, f"{tool.name} expone market_id al LLM"

    def test_every_tool_documents_itself_in_english_for_the_model(
        self, db_session: Session
    ) -> None:
        """El docstring ES el prompt de selección (skill cuadra-agent-prompts)."""
        factory = _factory(db_session)
        tools = [
            build_search_groceries(factory, MARKET),
            build_compare_prices(factory, MARKET),
            build_basket_for_budget(factory, MARKET),
        ]

        for tool in tools:
            assert tool.description, f"{tool.name} sin docstring"
            # El error típico es describir QUÉ hace y omitir cuándo NO aplica — y eso es lo que
            # hace que el modelo elija la tool equivocada.
            assert "Use it" in tool.description, f"{tool.name} no dice cuándo usarla"
            assert "Do NOT use" in tool.description, f"{tool.name} no dice cuándo NO usarla"


class TestBusquedaYCanasta:
    def test_search_groceries_returns_compact_ranked_results(
        self, db_session: Session
    ) -> None:
        _seed_product(
            db_session,
            name="Aceite Zumbaquisqueya Extra Virgen 1 Lt",
            brand="ZUMBAQUISQUEYA",
            prices={"TiendaUno": 89_500},
        )
        tool = build_search_groceries(_factory(db_session), MARKET)

        out = tool.invoke({"query": "zumbaquisqueya"})

        assert "Zumbaquisqueya" in out
        assert len(out.splitlines()) <= 6      # compacto: nunca un volcado de filas

    def test_search_with_no_results_says_no_match(self, db_session: Session) -> None:
        tool = build_search_groceries(_factory(db_session), MARKET)

        assert "no_match" in tool.invoke({"query": "sonic screwdriver"})

    def test_basket_for_budget_reports_one_basket_per_store(
        self, db_session: Session
    ) -> None:
        staging: dict = {}
        tool = build_basket_for_budget(_factory(db_session), MARKET, staging)

        out = tool.invoke({"amount": 5000})

        assert "groups" in out.lower() or "no_data" in out
        assert "basket" in staging
        assert staging["basket"].providers

    def test_basket_rejects_a_non_positive_budget_without_crashing(
        self, db_session: Session
    ) -> None:
        tool = build_basket_for_budget(_factory(db_session), MARKET)

        assert "invalid_budget" in tool.invoke({"amount": 0})


class TestRevelacionProgresiva:
    """§5.4·B — el titular primero; el detalle SOLO si lo piden.

    La canasta son ~20 líneas × 3 proveedores. Volcarlo entero es un muro de texto en el chat Y un
    gasto de tokens que casi nadie va a leer. Pero el detalle tiene que ser ALCANZABLE: sin él, un
    «dame la lista de Bravo» no tiene respuesta posible.
    """

    def test_without_a_store_it_returns_the_headline_not_the_items(
        self, db_session: Session
    ) -> None:
        staging: dict = {}
        tool = build_basket_for_budget(_factory(db_session), MARKET, staging)

        out = tool.invoke({"amount": 5000})

        assert "groups_covered" in out
        assert "item=" not in out, "el titular no debe traer el detalle de artículos"
        assert "basket" in staging

    def test_asking_for_ONE_store_returns_its_item_list(self, db_session: Session) -> None:
        staging: dict = {}
        tool = build_basket_for_budget(_factory(db_session), MARKET, staging)
        headline = tool.invoke({"amount": 5000})
        store = headline.splitlines()[1].split("store=")[1].split(" |")[0]
        basket_after_headline = staging["basket"]

        detail = tool.invoke({"amount": 5000, "store": store})

        assert "item=" in detail
        assert store in detail
        # El detalle por tienda NO stagea la acción visual; eso ya lo hizo el titular.
        assert staging["basket"] is basket_after_headline

    def test_an_unknown_store_lists_the_ones_that_exist(self, db_session: Session) -> None:
        tool = build_basket_for_budget(_factory(db_session), MARKET)

        out = tool.invoke({"amount": 5000, "store": "Supermercado Inventado"})

        assert "no_match" in out
