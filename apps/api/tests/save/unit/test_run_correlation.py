"""Unit — correlación corrida→match→canónico (F4 #4.5).

Hasta acá NADA ataba un `product_match` ni un `canonical_product` a la corrida que lo produjo.
Sin ese hilo son imposibles dos cosas que el v1 pide:

  - el **deep-link corrida→cola** (`/admin/review-queue?run_id=`): sin él, el operador es el join
    manual entre "esta corrida encoló 40" y "cuáles son esos 40";
  - **`new_canonicals_count`**: cuántos canónicos nacieron de lo que ESTA corrida descubrió
    (ver #4.3 — no puede vivir en `RefreshResult` porque la corrida no crea canónicos).

La alternativa era unir por ventana de tiempo (`created_at` entre inicio y fin de la corrida). Se
descarta: dos corridas solapadas se contaminan, y un match reprocesado se atribuiría a la corrida
equivocada. Un identificador explícito no tiene ese problema.
"""
from __future__ import annotations

from src.contexts.save.application.match_store_product import IncomingStoreProduct
from src.contexts.save.domain.entities.product_match import ProductMatch


class TestProductMatchCarriesTheRun:
    def test_a_match_records_the_run_that_produced_it(self) -> None:
        match = ProductMatch(
            store_product_id="sp-1",
            canonical_product_id="c-1",
            confidence=1.0,
            method="ean",
            status="auto_linked",
            run_id="dagster-run-abc",
        )
        assert match.run_id == "dagster-run-abc"

    def test_the_run_is_optional_so_historical_matches_stay_valid(self) -> None:
        """Las filas anteriores a F4 no tienen corrida, y un match creado a mano desde el admin
        tampoco nace de una. `None` es un valor legítimo, no un dato faltante."""
        match = ProductMatch(
            store_product_id="sp-1",
            canonical_product_id=None,
            confidence=0.0,
            method="human",
            status="pending_review",
        )
        assert match.run_id is None


class TestIncomingCarriesTheRun:
    def test_the_observation_carries_the_run_so_the_matcher_can_stamp_it(self) -> None:
        # El run_id es propiedad de ESTA observación, no del matcher: por eso viaja con la entrada
        # y no en el constructor del use-case.
        incoming = IncomingStoreProduct(
            store_product_id="sp-1",
            market_id="DO",
            name="Arroz",
            brand="LA GARZA",
            size="10 Lbs",
            run_id="dagster-run-abc",
        )
        assert incoming.run_id == "dagster-run-abc"

    def test_the_run_defaults_to_none_for_callers_outside_a_run(self) -> None:
        incoming = IncomingStoreProduct(
            store_product_id="sp-1", market_id="DO", name="Arroz", brand="", size=""
        )
        assert incoming.run_id is None
