"""Unit — las fuentes de extracción que siembra el seed (`store_registry`). PURO, sin DB.

Por qué existe (R1, 2026-07-16): hasta ahora el seed sembraba `store_registry` SOLO para Bravo, y el
wiring de Sirena/Nacional/Jumbo vivía hardcodeado en `ingestion/save/sources.py` — el "bridge F1" que
su propio docstring admitía. R1 corta ese bridge: el descubrimiento deriva sus tiendas del registry.

Eso convierte una omisión en un fallo TOTAL: si el registry solo tiene a Bravo, el descubrimiento
corre con UNA tienda y las otras tres desaparecen sin un solo error. Verificado contra dev: el
registry tenía 3 filas —Bravo (del seed) + Nacional y Sirena creadas A MANO desde la consola admin,
con una hora de diferencia— y **Jumbo no existía**. En un DB fresco (CI/prod) solo habría estado
Bravo.

Se testea el DATO y no la escritura: las fuentes son una tabla de configuración: qué plataforma, qué
base_url, qué headers. Un test que necesita Postgres para verificar que Jumbo lleva `Store: jumbo` no
es un test de la regla, es un test de SQLAlchemy.
"""
from __future__ import annotations

from seeds.save_seed import STORE_SOURCES
from src.contexts.save.domain.entities import SourcePlatform


def _by_name(name: str):  # type: ignore[no-untyped-def]
    return next(s for s in STORE_SOURCES if s.provider_name == name)


def test_every_ingested_chain_has_a_source_row() -> None:
    # Las cuatro que ingieren hoy + Merca Jumbo (scaffolded, DESHABILITADA). Si una ENABLED falta,
    # el descubrimiento la pierde EN SILENCIO.
    assert {s.provider_name for s in STORE_SOURCES} == {
        "Sirena", "Nacional", "Jumbo", "Bravo", "Merca Jumbo"
    }
    enabled = {s.provider_name for s in STORE_SOURCES if s.enabled}
    assert enabled == {"Sirena", "Nacional", "Jumbo", "Bravo"}  # Merca queda fuera hasta su secreto


def test_merca_jumbo_is_scaffolded_but_disabled_pending_its_secret_store_code() -> None:
    # Merca Jumbo = 3er banner del grupo CCN (shopId=7 en SupermercadosRD): un store-view PRIVADO del
    # Magento de Nacional. Su store code es un SECRETO (en la referencia, un GitHub Actions secret que
    # el repo público omite a propósito) que NO tenemos. Se deja CONFIGURADA pero DESHABILITADA — a un
    # secreto de andar: el admin llena `headers.Store` y la habilita cuando se consiga el código.
    merca = _by_name("Merca Jumbo")
    assert merca.platform is SourcePlatform.MAGENTO
    assert merca.base_url == "https://supermercadosnacional.com"  # store-view del Magento de Nacional
    assert merca.enabled is False
    assert not (merca.headers or {}).get("Store")  # placeholder vacío: el store code es secreto


def test_jumbo_carries_the_store_view_header_that_makes_it_jumbo() -> None:
    # Hallazgo doc 09: Jumbo y Nacional comparten instancia Magento (CCN). Sin el header
    # `Store: jumbo`, jumbo.com.do sirve el catálogo de NACIONAL — o sea, sin este dato la ingesta
    # no falla: guarda precios de Nacional etiquetados como Jumbo. Silencioso y corrupto.
    jumbo = _by_name("Jumbo")
    assert jumbo.platform is SourcePlatform.MAGENTO
    assert jumbo.base_url == "https://jumbo.com.do"
    assert jumbo.headers == {"Store": "jumbo"}


def test_nacional_uses_the_default_store_view() -> None:
    nacional = _by_name("Nacional")
    assert nacional.platform is SourcePlatform.MAGENTO
    assert nacional.base_url == "https://supermercadosnacional.com"
    assert not nacional.headers  # sin header → store view por defecto = Nacional


def test_sirena_is_vtex() -> None:
    sirena = _by_name("Sirena")
    assert sirena.platform is SourcePlatform.VTEX
    assert sirena.base_url == "https://www.sirena.do"


def test_bravo_keeps_its_rest_profile_and_sections() -> None:
    # No se rompe lo que ya andaba: Bravo sigue siendo REST_CATALOG con su profile y secciones.
    bravo = _by_name("Bravo")
    assert bravo.platform is SourcePlatform.REST_CATALOG
    assert bravo.endpoints["profile"] == "bravova"
    assert bravo.endpoints["store_id"] == "1000"
    assert len(bravo.endpoints["sections"]) > 1


def test_no_source_carries_a_secret() -> None:
    # El seed siembra CONFIG, nunca credenciales: el token de Bravo se carga desde el admin y vive
    # en `store_registry.auth` (§15). Un secreto en el repo es un secreto filtrado.
    for source in STORE_SOURCES:
        assert getattr(source, "auth", None) is None, f"{source.provider_name} trae auth en el seed"
