"""Unit — wiring de fuentes de Save (ingestion.save.sources): config PURA, sin red.

Formaliza el `_sources()` interino de seeds/save_refresh.py como única fuente de verdad del
wiring, compartida por el runner CLI y por los assets de Dagster. Verifica la config verificada
en el spike (doc 09): Sirena=VTEX, Nacional/Jumbo=Magento (Jumbo con header `Store: jumbo`).
"""
from __future__ import annotations

from ingestion.save.sources import BASKET_QUERIES, SAVE_MARKET, build_sources
from seeds.save_seed import provider_id


def test_builds_the_three_verified_sources() -> None:
    assert set(build_sources()) == {"sirena", "nacional", "jumbo"}


def test_sirena_is_vtex_with_market_and_provider() -> None:
    adapter = build_sources(queries=("arroz",))["sirena"][0]
    assert adapter._base_url == "https://www.sirena.do"
    assert adapter._provider_id == str(provider_id("Sirena"))
    assert adapter._market_id == SAVE_MARKET
    assert adapter._query == "arroz"


def test_nacional_is_magento_default_store() -> None:
    adapter = build_sources(queries=("arroz",))["nacional"][0]
    assert adapter._base_url == "https://supermercadosnacional.com"
    assert adapter._provider_id == str(provider_id("Nacional"))
    assert adapter._store_code is None  # store view default


def test_jumbo_is_magento_with_store_header() -> None:
    # hallazgo doc 09: jumbo.com.do sin header sirve NACIONAL → Store: jumbo elige el store view
    adapter = build_sources(queries=("arroz",))["jumbo"][0]
    assert adapter._base_url == "https://jumbo.com.do"
    assert adapter._provider_id == str(provider_id("Jumbo"))
    assert adapter._store_code == "jumbo"


def test_one_adapter_per_basket_query() -> None:
    sources = build_sources(queries=("arroz", "aceite"))
    assert all(len(adapters) == 2 for adapters in sources.values())


def test_default_basket_is_curated_and_market_is_do() -> None:
    assert SAVE_MARKET == "DO"
    assert "arroz la garza" in BASKET_QUERIES
