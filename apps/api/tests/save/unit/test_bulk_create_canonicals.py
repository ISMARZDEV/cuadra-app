"""Unit — `BulkCreateCanonicals`: convierte en canónicos las filas seleccionadas de la cola.

Es la acción que la cola en arranque en frío realmente necesita: medido sobre la cola real, las 48
filas tienen CERO candidatos, así que "aprobar" (enlazar a un canónico existente) no puede resolver
ninguna. Lo único que destraba es CREAR.

Todo lo que el canónico necesita se deriva del propio store_product —nombre, marca y cantidad vía
`parse_size` del dominio (48/48 parsean)— menos UNA cosa: la categoría. Por eso el diálogo pregunta
solo eso, y solo para las filas que no la tienen.
"""
from __future__ import annotations

from decimal import Decimal

from src.contexts.save.application.bulk_create_canonicals import BulkCreateCanonicals
from src.contexts.save.domain.classification import (
    CategoryClassification,
    ClassifiableProduct,
)


class _FakeScope:
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
    """Devuelve productos y la clasificación activa de cada uno (`None` = sin categoría)."""

    def __init__(self, products, leaves) -> None:  # type: ignore[no-untyped-def]
        self._products = products
        self._leaves = leaves

    def classifiable_for_matches(self, match_ids):  # type: ignore[no-untyped-def]
        return [(m, self._products[m]) for m in match_ids if m in self._products]

    def active_for(self, ref_id, *, is_canonical):  # type: ignore[no-untyped-def]
        leaf = self._leaves.get(ref_id)
        if leaf is None:
            return None
        return CategoryClassification(
            id="c1", store_product_id=ref_id, canonical_product_id=None,
            taxonomy_node_id=leaf, confidence=0.9, method="lexicon", status="active",
        )


class _FakeCreator:
    def __init__(self) -> None:
        self.calls: list = []

    def execute(self, *, match_id, product, decided_by):  # type: ignore[no-untyped-def]
        self.calls.append((match_id, product, decided_by))
        return f"canon-{match_id}"


def _p(ref: str, name: str, size: str = "5 Lb", brand: str = "Bisono") -> ClassifiableProduct:
    return ClassifiableProduct(ref_id=ref, is_canonical=False, name=name, brand=brand, size_text=size)


def _use_case(products, leaves, creator=None):  # type: ignore[no-untyped-def]
    return BulkCreateCanonicals(
        scope=_FakeScope(),
        products=_FakeProducts(products, leaves),
        creator=creator or _FakeCreator(),
        market_id="DO",
    )


class TestDerivesEverythingButTheCategory:
    def test_builds_the_canonical_from_the_store_product_itself(self) -> None:
        """Nombre, marca y cantidad salen del producto — el operador no los teclea 48 veces."""
        creator = _FakeCreator()
        use_case = _use_case(
            {"m1": _p("sp1", "Arroz Selecto Bisono 5 Lb", "5 Lb", "Bisono")},
            {"sp1": "leaf-arroz"},
            creator,
        )

        result = use_case.execute(["m1"], fallback_taxonomy_node_id=None, decided_by="admin")

        assert result.created == 1
        _match, product, _by = creator.calls[0]
        assert product.name == "Arroz Selecto Bisono 5 Lb"
        assert product.brand == "Bisono"
        assert product.taxonomy_node_id == "leaf-arroz"
        # `parse_size` del dominio: 5 Lb → 2.26796185 kg (masa). El front NO convierte.
        assert product.quantity.amount == Decimal("2.26796185")
        assert product.quantity.measure.value == "mass"


class TestTheCategoryRule:
    def test_a_row_WITHOUT_category_takes_the_fallback(self) -> None:
        creator = _FakeCreator()
        use_case = _use_case({"m1": _p("sp1", "Zzz Raro")}, {}, creator)

        use_case.execute(["m1"], fallback_taxonomy_node_id="leaf-otros", decided_by="admin")

        assert creator.calls[0][1].taxonomy_node_id == "leaf-otros"

    def test_a_row_WITH_category_keeps_its_own_and_ignores_the_fallback(self) -> None:
        """La regla que el usuario fijó: el fallback llena huecos, NUNCA pisa lo ya decidido."""
        creator = _FakeCreator()
        use_case = _use_case({"m1": _p("sp1", "Arroz")}, {"sp1": "leaf-arroz"}, creator)

        use_case.execute(["m1"], fallback_taxonomy_node_id="leaf-otros", decided_by="admin")

        assert creator.calls[0][1].taxonomy_node_id == "leaf-arroz"

    def test_without_category_NOR_fallback_the_row_is_skipped_not_invented(self) -> None:
        """Un canónico sin categoría no puede existir. Se reporta como omitida para que el diálogo
        pueda decir cuántas quedaron fuera — nunca se le inventa una hoja."""
        creator = _FakeCreator()
        use_case = _use_case({"m1": _p("sp1", "Zzz Raro")}, {}, creator)

        result = use_case.execute(["m1"], fallback_taxonomy_node_id=None, decided_by="admin")

        assert result.created == 0
        assert [s.match_id for s in result.skipped] == ["m1"]
        assert creator.calls == []


class TestIsolation:
    def test_an_unparseable_size_fails_only_its_own_row(self) -> None:
        creator = _FakeCreator()
        use_case = _use_case(
            {"m1": _p("sp1", "Arroz", "5 Lb"), "m2": _p("sp2", "Raro", "un puñado")},
            {"sp1": "leaf-arroz", "sp2": "leaf-arroz"},
            creator,
        )

        result = use_case.execute(["m1", "m2"], fallback_taxonomy_node_id=None, decided_by="admin")

        assert result.created == 1
        assert [f.match_id for f in result.failed] == ["m2"]

    def test_a_match_that_no_longer_exists_is_failed_not_dropped(self) -> None:
        use_case = _use_case({"m1": _p("sp1", "Arroz")}, {"sp1": "leaf-arroz"})

        result = use_case.execute(
            ["m1", "fantasma"], fallback_taxonomy_node_id=None, decided_by="admin"
        )

        assert result.created == 1
        assert [f.match_id for f in result.failed] == ["fantasma"]


class TestPerRowOverride:
    """El operador puede corregir una fila concreta desde el propio diálogo, viendo el producto."""

    def test_an_override_wins_over_the_fallback(self) -> None:
        creator = _FakeCreator()
        use_case = _use_case({"m1": _p("sp1", "Zzz")}, {}, creator)

        use_case.execute(
            ["m1"], fallback_taxonomy_node_id="leaf-otros", decided_by="admin",
            overrides={"m1": "leaf-elegida"},
        )

        assert creator.calls[0][1].taxonomy_node_id == "leaf-elegida"

    def test_an_override_wins_even_over_an_EXISTING_category(self) -> None:
        """Abrir el selector de una fila YA clasificada y elegir otra cosa es corregirla. El
        fallback nunca pisa; un override sí — son actos distintos."""
        creator = _FakeCreator()
        use_case = _use_case({"m1": _p("sp1", "Arroz")}, {"sp1": "leaf-arroz"}, creator)

        use_case.execute(
            ["m1"], fallback_taxonomy_node_id=None, decided_by="admin",
            overrides={"m1": "leaf-corregida"},
        )

        assert creator.calls[0][1].taxonomy_node_id == "leaf-corregida"

    def test_rows_without_an_override_are_untouched_by_it(self) -> None:
        creator = _FakeCreator()
        use_case = _use_case(
            {"m1": _p("sp1", "Arroz"), "m2": _p("sp2", "Otro")},
            {"sp1": "leaf-arroz", "sp2": "leaf-otro"},
            creator,
        )

        use_case.execute(
            ["m1", "m2"], fallback_taxonomy_node_id=None, decided_by="admin",
            overrides={"m1": "leaf-corregida"},
        )

        assert creator.calls[0][1].taxonomy_node_id == "leaf-corregida"
        assert creator.calls[1][1].taxonomy_node_id == "leaf-otro"
