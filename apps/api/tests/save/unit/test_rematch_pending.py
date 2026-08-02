"""Unit — `RematchPending`: re-corre la cascada sobre filas YA en la cola. PURO (fakes, sin DB).

Por qué existe (2026-08-02): `RefreshCatalogPrices` sólo enruta al matcher los `store_product`
DESCONOCIDOS (`exists(provider_id, external_id)`), así que un producto que cayó en la cola cuando el
catálogo era chico **no se vuelve a evaluar NUNCA**, por más canónicos que se creen después. Los
candidatos quedan congelados en el catálogo del día que entró. Hasta ahora la única salida era
descartar (que además pierde el histórico de precios) o correr un script de CLI.
"""
from __future__ import annotations


from src.contexts.save.application.rematch_pending import RematchPending
from src.contexts.save.domain.rematch import RematchableProduct


class FakeScope:
    """`begin_nested` como contextmanager — el SAVEPOINT por fila del patrón de lotes."""

    def __init__(self) -> None:
        self.nested = 0

    def begin_nested(self):  # type: ignore[no-untyped-def]
        self.nested += 1
        return self

    def __enter__(self):  # type: ignore[no-untyped-def]
        return self

    def __exit__(self, *exc):  # type: ignore[no-untyped-def]
        return False


def _p(store_product_id: str, **over) -> RematchableProduct:  # type: ignore[no-untyped-def]
    return RematchableProduct(store_product_id=store_product_id, **{"name": "arroz", **over})


class FakeProducts:
    def __init__(self, by_match: dict[str, RematchableProduct]) -> None:
        self._by_match = by_match

    def rematchable_for_matches(self, match_ids: list[str]):  # type: ignore[no-untyped-def]
        return [(mid, self._by_match[mid]) for mid in match_ids if mid in self._by_match]


class FakeResult:
    def __init__(self, status: str, method: str = "ean", confidence: float = 1.0) -> None:
        self.status = status
        self.method = method
        self.confidence = confidence


class FakeMatcher:
    def __init__(self, results: dict[object, FakeResult] | None = None, boom: bool = False) -> None:
        self._results = results or {}
        self._boom = boom
        self.calls: list[object] = []

    def execute(self, product):  # type: ignore[no-untyped-def]
        self.calls.append(product)
        if self._boom:
            raise RuntimeError("la cascada explotó")
        return self._results.get(
            product.store_product_id, FakeResult("pending_review", "human", 0.0)
        )


def _use_case(products, matcher):  # type: ignore[no-untyped-def]
    return RematchPending(scope=FakeScope(), products=products, matcher=matcher)


def test_reports_auto_linked_and_still_pending_separately() -> None:
    # Un lote que enlaza 1 de 2 NO puede leerse como terminado: lo que sigue en cola es trabajo
    # para el humano y tiene que verse.
    matcher = FakeMatcher({"p-1": FakeResult("auto_linked", "ean", 1.0)})
    use_case = _use_case(FakeProducts({"m-1": _p("p-1"), "m-2": _p("p-2")}), matcher)

    result = use_case.execute(["m-1", "m-2"], market_id="DO")

    assert result.auto_linked == 1
    assert result.still_pending == 1
    assert result.failed == []


def test_a_match_that_no_longer_exists_is_REPORTED_not_silently_dropped() -> None:
    # Devolver menos filas de las pedidas sin decir por qué es el silencio que este módulo no se
    # permite: el operador seleccionó 2 y tiene que saber qué pasó con las 2.
    use_case = _use_case(FakeProducts({"m-1": _p("p-1")}), FakeMatcher())

    result = use_case.execute(["m-1", "m-fantasma"], market_id="DO")

    assert [f.match_id for f in result.failed] == ["m-fantasma"]


def test_one_row_blowing_up_does_not_abort_the_batch() -> None:
    # SAVEPOINT por fila: el fallo de UNA no deshace las ya confirmadas ni cancela las que faltan.
    use_case = _use_case(FakeProducts({"m-1": _p("p-1"), "m-2": _p("p-2")}), FakeMatcher(boom=True))

    result = use_case.execute(["m-1", "m-2"], market_id="DO")

    assert len(result.failed) == 2
    assert result.auto_linked == 0


def test_runs_the_cascade_once_per_selected_row() -> None:
    matcher = FakeMatcher()
    use_case = _use_case(FakeProducts({"m-1": _p("p-1"), "m-2": _p("p-2")}), matcher)

    use_case.execute(["m-1", "m-2"], market_id="DO")

    assert [c.store_product_id for c in matcher.calls] == ["p-1", "p-2"]


def test_an_empty_selection_does_not_touch_the_matcher() -> None:
    matcher = FakeMatcher()
    result = _use_case(FakeProducts({}), matcher).execute([], market_id="DO")

    assert matcher.calls == []
    assert result.auto_linked == result.still_pending == 0


def test_the_market_comes_from_the_caller_and_the_run_id_is_never_stamped() -> None:
    # Una re-evaluación NO es un hallazgo de una corrida de ingesta: estamparle un `run_id` le
    # sumaría productos al embudo de una corrida que no los descubrió.
    matcher = FakeMatcher()
    _use_case(FakeProducts({"m-1": _p("p-1", ean="750", source_category="Granos")}), matcher).execute(
        ["m-1"], market_id="DO"
    )

    sent = matcher.calls[0]
    assert sent.market_id == "DO"
    assert sent.ean == "750"
    assert sent.source_category == "Granos"
    assert sent.run_id is None


class FakeCanonicalNames:
    def __init__(self, names: dict[str, str]) -> None:
        self._names = names
        self.calls: list[list[str]] = []

    def names_for(self, canonical_ids: list[str]) -> dict[str, str]:
        self.calls.append(canonical_ids)
        return {cid: self._names[cid] for cid in canonical_ids if cid in self._names}


def _use_case_named(products, matcher, names):  # type: ignore[no-untyped-def]
    return RematchPending(
        scope=FakeScope(), products=products, matcher=matcher, canonicals=names
    )


def test_a_linked_row_carries_BOTH_names_so_the_operator_can_audit_the_link() -> None:
    """Un id contra otro id es imposible de auditar. El operador tiene que poder LEER «este
    producto de la cola quedó enlazado a este canónico» sin abrir cinco fichas."""
    linked = FakeResult("auto_linked", "ean", 1.0)
    linked.canonical_product_id = "canon-1"  # type: ignore[attr-defined]
    matcher = FakeMatcher({"p-1": linked})
    names = FakeCanonicalNames({"canon-1": "Arroz Selecto 10 Lb"})
    use_case = _use_case_named(FakeProducts({"m-1": _p("p-1", name="ARROZ SELECTO 10 LB")}), matcher, names)

    result = use_case.execute(["m-1"], market_id="DO")

    row = result.rows[0]
    assert row.store_product_name == "ARROZ SELECTO 10 LB"
    assert row.canonical_product_id == "canon-1"
    assert row.canonical_name == "Arroz Selecto 10 Lb"


def test_names_are_looked_up_ONCE_for_the_whole_batch() -> None:
    # Un lote de 46 filas no puede hacer 46 viajes a la base para resolver nombres.
    a, b = FakeResult("auto_linked", "ean", 1.0), FakeResult("auto_linked", "trgm", 0.9)
    a.canonical_product_id = "canon-1"  # type: ignore[attr-defined]
    b.canonical_product_id = "canon-2"  # type: ignore[attr-defined]
    names = FakeCanonicalNames({"canon-1": "A", "canon-2": "B"})
    use_case = _use_case_named(
        FakeProducts({"m-1": _p("p-1"), "m-2": _p("p-2")}),
        FakeMatcher({"p-1": a, "p-2": b}),
        names,
    )

    use_case.execute(["m-1", "m-2"], market_id="DO")

    assert len(names.calls) == 1
    assert sorted(names.calls[0]) == ["canon-1", "canon-2"]


def test_a_row_that_stayed_in_the_queue_has_no_canonical_name() -> None:
    # `None` y no "": no hay canónico al que se haya enlazado, y un string vacío se renderiza como
    # una celda en blanco indistinguible de "no pudimos resolver el nombre".
    names = FakeCanonicalNames({})
    use_case = _use_case_named(FakeProducts({"m-1": _p("p-1")}), FakeMatcher(), names)

    row = use_case.execute(["m-1"], market_id="DO").rows[0]

    assert row.canonical_product_id is None
    assert row.canonical_name is None
