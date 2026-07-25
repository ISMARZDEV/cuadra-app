"""Unit — sugerencias de categoría sobre un CONJUNTO de canónicos (F5, US-CP-L10).

El SDD pide algo distinto de sugerir por producto: "en bulk las sugerencias se calculan sobre el
conjunto y se advierte si los seleccionados parecen de categorías distintas".

Esa advertencia es lo importante. El flujo previsto es «filtro Sin categoría → seleccionar el
grupo homogéneo → asignar», y asignar una categoría a un lote heterogéneo ensucia varios productos
de una sola vez — mucho más caro de deshacer que de evitar.
"""
from __future__ import annotations

from src.contexts.save.domain.canonical_bulk_category import (
    aggregate_category_suggestions,
)
from src.contexts.save.domain.category_suggestion import CategorySuggestion


def suggestion(node_id: str, tokens: list[str]) -> CategorySuggestion:
    return CategorySuggestion(taxonomy_node_id=node_id, matched_tokens=tokens)


class TestAggregate:
    def test_a_leaf_supported_by_every_product_wins(self) -> None:
        result = aggregate_category_suggestions(
            {
                "p1": [suggestion("arroz", ["arroz"])],
                "p2": [suggestion("arroz", ["arroz"])],
                "p3": [suggestion("arroz", ["arroz"])],
            }
        )

        assert result.suggestions[0].taxonomy_node_id == "arroz"
        assert result.suggestions[0].product_count == 3

    def test_it_ranks_by_HOW_MANY_PRODUCTS_support_the_leaf(self) -> None:
        """No por tokens: en bulk lo que importa es cuántos de los seleccionados apuntan ahí.
        Un solo producto con un nombre muy descriptivo no puede ganarle a tres que coinciden."""
        result = aggregate_category_suggestions(
            {
                "p1": [suggestion("leche", ["leche", "entera", "lacteos"])],
                "p2": [suggestion("arroz", ["arroz"])],
                "p3": [suggestion("arroz", ["arroz"])],
            }
        )

        assert [s.taxonomy_node_id for s in result.suggestions] == ["arroz", "leche"]

    def test_a_homogeneous_selection_is_NOT_flagged(self) -> None:
        result = aggregate_category_suggestions(
            {"p1": [suggestion("arroz", ["arroz"])], "p2": [suggestion("arroz", ["arroz"])]}
        )

        assert result.heterogeneous is False

    def test_products_pointing_at_DIFFERENT_leaves_are_flagged(self) -> None:
        """Es la advertencia que pide el SDD: el operador está por asignar una sola categoría a
        cosas que el léxico ve como distintas."""
        result = aggregate_category_suggestions(
            {"p1": [suggestion("arroz", ["arroz"])], "p2": [suggestion("leche", ["leche"])]}
        )

        assert result.heterogeneous is True

    def test_only_the_TOP_suggestion_of_each_product_decides_heterogeneity(self) -> None:
        """Un producto puede pegar dos hojas por tener dos tokens; eso no lo vuelve incompatible
        con el lote. Lo que se compara es en qué cree PRIMERO cada uno."""
        result = aggregate_category_suggestions(
            {
                "p1": [suggestion("arroz", ["arroz", "granos"]), suggestion("leche", ["leche"])],
                "p2": [suggestion("arroz", ["arroz"])],
            }
        )

        assert result.heterogeneous is False

    def test_products_without_any_signal_do_not_make_the_lot_heterogeneous(self) -> None:
        """No tener sugerencia no es lo mismo que tener una distinta: son justo los que el
        operador está tratando de clasificar."""
        result = aggregate_category_suggestions(
            {"p1": [suggestion("arroz", ["arroz"])], "p2": [], "p3": []}
        )

        assert result.heterogeneous is False
        assert result.suggestions[0].taxonomy_node_id == "arroz"

    def test_a_selection_with_no_signal_at_all_suggests_nothing(self) -> None:
        result = aggregate_category_suggestions({"p1": [], "p2": []})

        assert result.suggestions == []
        assert result.heterogeneous is False

    def test_it_reports_how_many_of_the_selected_had_no_signal(self) -> None:
        """Dato honesto para el operador: cuántos va a clasificar a ciegas."""
        result = aggregate_category_suggestions(
            {"p1": [suggestion("arroz", ["arroz"])], "p2": [], "p3": []}
        )

        assert result.without_signal == 2

    def test_it_caps_the_list(self) -> None:
        result = aggregate_category_suggestions(
            {f"p{i}": [suggestion(f"leaf-{i}", ["x"])] for i in range(10)}, limit=3
        )

        assert len(result.suggestions) == 3

    def test_the_union_of_tokens_survives_for_the_explanation(self) -> None:
        """La señal de origen sigue siendo obligatoria en bulk: el operador tiene que ver POR QUÉ
        se le propone la hoja, no sólo cuántos productos la apoyan."""
        result = aggregate_category_suggestions(
            {
                "p1": [suggestion("arroz", ["arroz"])],
                "p2": [suggestion("arroz", ["granos"])],
            }
        )

        assert sorted(result.suggestions[0].matched_tokens) == ["arroz", "granos"]
