"""Unit — `SetProductCategory`: el operador fija a mano la categoría de un store_product.

Es el override HUMANO que faltaba. El propio código lo tenía anotado como hueco conocido
(`CreateCanonicalPanel`: "el override manual de categoría es un follow-up"), y sin él la cola en
arranque en frío no se puede destrabar: la clasificación automática deja huecos a propósito
(banda gris / conflicto de señales / sin etapa vectorial) y nadie podía llenarlos.
"""
from __future__ import annotations

import pytest

from src.contexts.save.application.set_product_category import SetProductCategory


class _FakeClassifications:
    def __init__(self, existing=None) -> None:  # type: ignore[no-untyped-def]
        self.saved: list = []
        self._existing = existing

    def save_active(self, classification) -> None:  # type: ignore[no-untyped-def]
        self.saved.append(classification)

    def active_for(self, ref_id, *, is_canonical):  # type: ignore[no-untyped-def]
        return self._existing


class TestManualOverride:
    def test_records_the_decision_as_HUMAN_with_full_confidence(self) -> None:
        """El método distingue quién decidió. Guardarlo como `lexicon` o `vector` haría que una
        decisión humana se contara en las métricas de auto-enlace — el KPI que mide si el pipeline
        se sostiene solo pasaría a incluir el trabajo manual, que es justo lo que NO mide."""
        repo = _FakeClassifications()

        SetProductCategory(repo).execute(
            store_product_id="sp-1", taxonomy_node_id="leaf-arroz", decided_by="admin"
        )

        saved = repo.saved[0]
        assert saved.store_product_id == "sp-1"
        assert saved.taxonomy_node_id == "leaf-arroz"
        assert saved.method == "human"
        assert saved.confidence == 1.0
        assert saved.status == "active"
        assert saved.canonical_product_id is None

    def test_overwrites_a_previous_classification(self) -> None:
        """`save_active` supersede la anterior en la MISMA transacción (invariante del repo: a lo
        sumo una activa por producto). Corregir una categoría equivocada es el caso normal, no la
        excepción — el clasificador acierta mucho pero no siempre."""
        previous = object()
        repo = _FakeClassifications(existing=previous)

        SetProductCategory(repo).execute(
            store_product_id="sp-1", taxonomy_node_id="leaf-otro", decided_by="admin"
        )

        assert len(repo.saved) == 1
        assert repo.saved[0].taxonomy_node_id == "leaf-otro"

    def test_refuses_an_empty_category(self) -> None:
        """"Sin categoría" no se fija: se DEJA sin clasificar. Persistir una hoja vacía crearía una
        clasificación `active` que afirma no saber nada — peor que la ausencia de fila, que ya
        significa exactamente eso."""
        repo = _FakeClassifications()

        with pytest.raises(ValueError):
            SetProductCategory(repo).execute(
                store_product_id="sp-1", taxonomy_node_id="", decided_by="admin"
            )

        assert repo.saved == []
