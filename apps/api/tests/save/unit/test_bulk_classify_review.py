"""Unit — `BulkClassifyReview`: clasifica en lote las filas seleccionadas de la cola.

Espeja `BulkResolveReview`: cada fila es ATÓMICA e INDEPENDIENTE (SAVEPOINT por fila), y el fallo
de una NUNCA arrastra ni silencia a las demás.

Lo que este caso de uso agrega sobre "correr el clasificador N veces" es el RESUMEN HONESTO: cuántas
quedaron clasificadas y cuántas siguen sin decidir. Sin ese número, un lote que clasifica 32 de 48
se ve igual que uno que clasificó todo, y el operador no sabe que le quedan 16 por mirar.
"""
from __future__ import annotations

from src.contexts.save.application.bulk_classify_review import BulkClassifyReview
from src.contexts.save.domain.classification import (
    ClassifiableProduct,
    ClassificationResult,
)


class _FakeScope:
    """SAVEPOINT falso — verifica que cada fila corre en su propio ámbito."""

    def __init__(self) -> None:
        self.opened = 0

    def begin_nested(self):  # type: ignore[no-untyped-def]
        self.opened += 1
        return self

    def __enter__(self):  # type: ignore[no-untyped-def]
        return self

    def __exit__(self, *_):  # type: ignore[no-untyped-def]
        return False


class _FakeProducts:
    def __init__(self, mapping) -> None:  # type: ignore[no-untyped-def]
        self._mapping = mapping

    def classifiable_for_matches(self, match_ids):  # type: ignore[no-untyped-def]
        return [(m, self._mapping[m]) for m in match_ids if m in self._mapping]


class _FakeClassifier:
    """Devuelve lo guionado por nombre de producto; `None` = sin clasificar (banda gris)."""

    def __init__(self, by_name) -> None:  # type: ignore[no-untyped-def]
        self._by_name = by_name
        self.calls: list[str] = []

    def execute(self, product, market_id):  # type: ignore[no-untyped-def]
        self.calls.append(product.name)
        leaf = self._by_name.get(product.name)
        if leaf is None:
            return ClassificationResult(None, 0.0, "none", "grey")
        return ClassificationResult(leaf, 0.9, "lexicon", "auto_link")


def _product(ref: str, name: str) -> ClassifiableProduct:
    return ClassifiableProduct(ref_id=ref, is_canonical=False, name=name)


def _use_case(mapping, by_name, scope=None):  # type: ignore[no-untyped-def]
    return BulkClassifyReview(
        scope=scope or _FakeScope(),
        products=_FakeProducts(mapping),
        classifier=_FakeClassifier(by_name),
    )


class TestSummary:
    def test_counts_what_was_decided_and_what_was_left_to_the_human(self) -> None:
        use_case = _use_case(
            {"m1": _product("sp1", "Arroz"), "m2": _product("sp2", "Xyz raro")},
            {"Arroz": "leaf-arroz"},
        )

        result = use_case.execute(["m1", "m2"], market_id="DO")

        assert result.classified == 1
        assert result.undecided == 1
        # El detalle por fila deja a la UI refrescar solo lo que cambió.
        assert result.rows[0].match_id == "m1"
        assert result.rows[0].taxonomy_node_id == "leaf-arroz"
        assert result.rows[1].taxonomy_node_id is None

    def test_a_row_whose_product_vanished_is_reported_not_crashed(self) -> None:
        """Un match sin store_product cargable (borrado entre el pintado y el clic) no puede tumbar
        el lote entero: se cuenta como fallida y las demás siguen."""
        use_case = _use_case({"m1": _product("sp1", "Arroz")}, {"Arroz": "leaf-arroz"})

        result = use_case.execute(["m1", "fantasma"], market_id="DO")

        assert result.classified == 1
        assert [f.match_id for f in result.failed] == ["fantasma"]


class TestIsolation:
    def test_each_row_runs_in_its_own_savepoint(self) -> None:
        scope = _FakeScope()
        use_case = _use_case(
            {"m1": _product("sp1", "Arroz"), "m2": _product("sp2", "Leche")},
            {"Arroz": "leaf-arroz", "Leche": "leaf-leche"},
            scope=scope,
        )

        use_case.execute(["m1", "m2"], market_id="DO")

        assert scope.opened == 2

    def test_one_failing_row_does_not_stop_the_batch(self) -> None:
        class _Exploding(_FakeClassifier):
            def execute(self, product, market_id):  # type: ignore[no-untyped-def]
                if product.name == "Bomba":
                    raise RuntimeError("el embedder no respondió")
                return super().execute(product, market_id)

        use_case = BulkClassifyReview(
            scope=_FakeScope(),
            products=_FakeProducts(
                {
                    "m1": _product("sp1", "Arroz"),
                    "m2": _product("sp2", "Bomba"),
                    "m3": _product("sp3", "Leche"),
                }
            ),
            classifier=_Exploding({"Arroz": "leaf-arroz", "Leche": "leaf-leche"}),
        )

        result = use_case.execute(["m1", "m2", "m3"], market_id="DO")

        assert result.classified == 2
        assert [f.match_id for f in result.failed] == ["m2"]
        assert "el embedder no respondió" in result.failed[0].error
