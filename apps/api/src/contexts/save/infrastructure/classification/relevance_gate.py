"""TaxonomyRelevanceGate (R2) — descarta EN DESCUBRIMIENTO el ruido fuera del scope del catálogo.

Medido 2026-07-16: aun con la canasta acotada a arroz+legumbre, Magento hace OR de tokens y trae
comida de perro / velas / pañitos por queries de "arroz"/"verdes" → el 45% de la cola era ruido de
categorías que el catálogo no cubre. Este gate resuelve el `source_category` del producto a un
top-level de taxonomía (vía el mismo lexicon que usa el matcher) y lo contrasta con el FOOTPRINT del
catálogo — las raíces top-level que ocupan los canónicos.

Contrato CONSERVADOR (misma filosofía que los gates de matching): devuelve `True` SOLO ante señal
POSITIVA de fuera-de-footprint. Si el `source_category` no resuelve a ninguna hoja (sin señal), NO
descarta — perder descubrimiento legítimo es el error caro; dejar ruido en la cola es el barato.

Se compara a nivel TOP-LEVEL (raíz), no por hoja: el catálogo es de un solo pasillo y un footprint
por-hoja sobre-descartaría; top-level corta Mascotas/Hogar/Bebidas y se ensancha solo cuando crece
el catálogo. Satisface `RelevanceGate` (Protocol en `application/refresh_prices.py`) por duck-typing.
"""
from __future__ import annotations

from .lexicon import LexiconIndex, lexicon_match_path


class TaxonomyRelevanceGate:
    def __init__(
        self,
        *,
        lexicon: LexiconIndex,
        leaf_to_root: dict[str, str],
        footprint: frozenset[str],
    ) -> None:
        self._lexicon = lexicon
        self._leaf_to_root = leaf_to_root
        self._footprint = footprint

    def is_off_scope(self, source_category: str) -> bool:
        hit = lexicon_match_path(source_category, self._lexicon)
        if hit is None:
            return False  # no resuelve → sin señal positiva → conservador: no descartar
        leaf_id = hit[0]
        root_id = self._leaf_to_root.get(leaf_id, leaf_id)  # la hoja puede ser ya una raíz
        return root_id not in self._footprint
