"""Modelo de dominio de la clasificación de categoría (save-category-classification). PURO (ADR 31).

- `ClassifiableProduct`: input a la cascada (nombre/marca/tamaño de un store o canonical product).
- `CategoryCandidate`: una hoja candidata rankeada por una etapa (trgm/vector).
- `ClassificationResult`: salida de la cascada antes de persistir (hoja + confianza + método + banda).
- `CategoryClassification`: el registro persistente (fila `active` de `category_classification`).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


@dataclass(frozen=True, slots=True)
class ClassifiableProduct:
    ref_id: str  # store_product_id o canonical_product_id
    is_canonical: bool
    name: str
    brand: str = ""
    size_text: str = ""
    # Etapa B: categoría CRUDA de la fuente (path del adapter, ej. "Despensa > Arroz y Granos").
    # Segunda señal, independiente del nombre, que la cascada cruza para clasificar (ver
    # ClassifyStoreProduct). "" = la fuente no la trae → se clasifica solo por nombre.
    source_category: str = ""


@dataclass(frozen=True, slots=True)
class CategoryCandidate:
    taxonomy_node_id: str
    score: float
    source: str  # "trgm" | "vector"
    name: str = ""  # nombre de la subcategoría (para el juez de la banda grey)


@dataclass(frozen=True, slots=True)
class ClassificationResult:
    taxonomy_node_id: str | None  # la HOJA asignada; None = sin clasificar
    confidence: float
    method: str  # lexicon|trgm|vector|hybrid|llm|human|none
    band: str  # auto|grey|human


@dataclass(frozen=True, slots=True)
class CategoryVerdict:
    """Veredicto (ya validado) del juez LLM sobre si un producto pertenece a una categoría candidata.
    `match` = pertenece; `no_match` = no pertenece; `uncertain` = ambiguo (fail-safe, no asigna)."""

    decision: Literal["match", "no_match", "uncertain"]
    confidence: float
    cited_fields: list[str] = field(default_factory=list)
    # Costo de la llamada — instrumentación pura, nunca parte de la decisión. Espeja los campos que
    # `JudgeVerdict` (matching) trae desde F2·B1. Este juez es el que MÁS llama del subsistema (147
    # clasificaciones vía `llm` contra 12 del otro) y era el único sin medir, así que el mayor
    # gasto de LLM era también el más ciego. `None` = no hubo metadata de uso que reportar.
    input_tokens: int | None = None
    output_tokens: int | None = None
    model: str | None = None


@dataclass(frozen=True, slots=True)
class CategoryClassification:
    id: str
    store_product_id: str | None
    canonical_product_id: str | None
    taxonomy_node_id: str
    confidence: float
    method: str
    status: str  # active|superseded|rejected


@dataclass(frozen=True, slots=True)
class CategoryDecision:
    """Lo que la cascada decidió y CON QUÉ EVIDENCIA — incluido el caso en que NO decidió.

    Es distinta de `CategoryClassification` y no la reemplaza. Aquélla registra la categoría
    ASIGNADA (su hoja es NOT NULL a propósito); ésta registra el EVENTO de decisión, que muchas
    veces termina sin hoja. Medido 2026-08-01: 89 de 292 productos (31%) quedaron sin clasificar, y
    averiguar por qué exigió reproducir la cascada producto por producto —volviendo a llamar al
    LLM— porque las dos ramas de abstención (`conflict` y `none`) no persistían nada.

    Guardar una abstención NO la convierte en una clasificación: `taxonomy_node_id` queda en `None`
    y ninguna lectura del catálogo mira esta tabla. La regla sagrada —el sistema nunca inventa una
    categoría— se mantiene intacta; lo único que cambia es que ahora el sistema recuerda que dudó.

    `source_leaf_id` y `name_leaf_id` son el corazón del registro: son lo que propuso CADA señal por
    separado, y sin ellos un `conflict` es indistinguible de un `none` una vez guardado.
    """

    ref_id: str
    is_canonical: bool
    market_id: str
    method: str  # lexicon|source|source_name|vector|llm|conflict|none
    taxonomy_node_id: str | None  # None = la cascada se abstuvo
    confidence: float = 0.0
    band: str = "human"
    # Evidencia por señal — lo que hoy se pierde.
    source_leaf_id: str | None = None  # hoja que resolvió la categoría de ORIGEN de la tienda
    name_leaf_id: str | None = None  # hoja que resolvió la cascada por NOMBRE
    matched_tokens: tuple[str, ...] = ()  # tokens del léxico que pegaron (forma de superficie)
    vector_top: tuple[CategoryCandidate, ...] = ()  # top-k del vector, con su score

    @property
    def abstained(self) -> bool:
        return self.taxonomy_node_id is None
