"""Unit — wiring de fuentes de Save (ingestion.save.sources): config PURA, sin red.

Formaliza el `_sources()` interino de seeds/save_refresh.py como única fuente de verdad del
wiring, compartida por el runner CLI y por los assets de Dagster. Verifica la config verificada
en el spike (doc 09): Sirena=VTEX, Nacional/Jumbo=Magento (Jumbo con header `Store: jumbo`).

La canasta NO vive acá: es DATO (tabla `basket_query`), y quien la lee es
`composition.build_basket_queries`. Ver el bloque del final.
"""
from __future__ import annotations

import pytest

from ingestion.save.sources import SAVE_MARKET, build_sources
from seeds.save_seed import provider_id


def test_builds_the_three_verified_sources() -> None:
    assert set(build_sources(queries=("arroz",))) == {"sirena", "nacional", "jumbo"}


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


def test_market_is_do() -> None:
    assert SAVE_MARKET == "DO"


# ── La canasta hardcodeada no existe más (Fase 0, 2026-07-16) ─────────────────────────────────
# `BASKET_QUERIES` era un tuple de 213 términos en el código, y `build_sources(queries=BASKET_QUERIES)`
# lo ponía de DEFAULT. Desde PR #29 la canasta vive en la tabla `basket_query` y los assets de Dagster
# la leen de ahí — pero `seeds/save_refresh.py` (el CLI de `make save-refresh`) llamaba `build_sources()`
# SIN argumentos y se llevaba el hardcode en silencio.
#
# Eso no era código muerto: era DIVERGENCIA. Desactivabas una query en el admin y Dagster dejaba de
# ingerirla mientras `make save-refresh` la seguía corriendo — y los dos decían "listo" igual. Es la
# forma EXACTA de los cinco bugs que ya pagó la ingesta: un fallback indistinguible del resultado real.
#
# El default no se quita "para limpiar": se quita para que ningún caller futuro pueda volver a caer en
# él por olvido. Que el olvido sea IMPOSIBLE es la única salvaguarda que no depende de la disciplina.


def test_the_hardcoded_basket_is_gone() -> None:
    import ingestion.save.sources as sources

    assert not hasattr(sources, "BASKET_QUERIES")


def test_building_sources_without_a_basket_is_impossible() -> None:
    # Sin default no hay caída silenciosa al hardcode: o pasás la canasta (que sale de la tabla), o
    # no compila. La divergencia deja de ser una cuestión de acordarse.
    with pytest.raises(TypeError):
        build_sources()  # type: ignore[call-arg]
