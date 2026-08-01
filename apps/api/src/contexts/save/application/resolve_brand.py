"""`ResolveBrand` — rellena la marca de un producto cuya tienda NO la publica, reconociéndola
dentro del nombre contra el catálogo de marcas que ya conocemos.

Ni Magento (Nacional/Jumbo) ni Bravo exponen marca; Sirena (VTEX) sí. Este use-case usa lo que
Sirena nos enseñó para leer los catálogos de las otras dos: si "LA GARZA" ya es una marca del
catálogo, entonces "LA GARZA ARROZ 10 LB" es de La Garza. La regla de decisión vive en el DOMINIO
(`brand_from_name`); acá sólo se resuelve de dónde sale el vocabulario y se cachea.

El índice se construye UNA vez por instancia: una corrida de ingesta procesa miles de entradas y
releer la tabla de marcas en cada una sería una query por producto. La contrapartida es que las
marcas creadas DURANTE la corrida no entran en su propio índice — es aceptable: la corrida
siguiente las verá, y refrescar el índice a mitad haría que el resultado dependiera del orden en
que llegaron los productos.
"""
from __future__ import annotations

from ..domain.brand_from_name import BrandIndex, build_brand_index, match_brand
from ..domain.ports import CanonicalProductRepository


class ResolveBrand:
    def __init__(self, canonical_repo: CanonicalProductRepository) -> None:
        self._repo = canonical_repo
        self._cache: dict[str, BrandIndex] = {}

    def _index_for(self, market_id: str) -> BrandIndex:
        if market_id not in self._cache:
            self._cache[market_id] = build_brand_index(self._repo.list_brand_names(market_id))
        return self._cache[market_id]

    def execute(self, product_name: str, market_id: str) -> str | None:
        """La marca conocida que aparece en el nombre, o `None` si no hay ninguna.

        `None` NO es un fallo: significa "no la sé", y quien persiste debe dejar intacta la marca
        que ya hubiera. Devolver `""` la borraría en cada corrida.
        """
        return match_brand(product_name, self._index_for(market_id))
