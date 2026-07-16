"""Unit — verificación del candidato devuelto por una búsqueda por BARCODE (Loop B). PURO.

Fix del hallazgo live 2026-07-12: Loop B ingestaba los ~65 resultados de la búsqueda dirigida y
matcheaba cada uno contra CUALQUIER canónico → el objetivo se cubría por casualidad (1/23). Se pasó a
seleccionar UN candidato para el objetivo (EAN exacto → o mayor similitud trigram del nombre) y solo
ESE va a la cascada.

R4 (2026-07-16) sacó la mitad del nombre: la Cobertura es **EAN puro**. Ver el bloque de abajo.
"""
from __future__ import annotations

from dataclasses import dataclass

from src.contexts.save.domain.candidate_selection import select_ean_match


@dataclass(frozen=True)
class _Cand:
    name: str
    ean: str | None = None


def test_returns_the_candidate_whose_barcode_is_the_target() -> None:
    cands = [_Cand("otra cosa", ean="0760593023182"), _Cand("Arroz La Garza", ean="07460083780023")]
    assert select_ean_match(target_ean="07460083780023", candidates=cands) is cands[1]


def test_the_barcode_wins_no_matter_what_the_name_says() -> None:
    # El nombre puede ser IRRECONOCIBLE ("GOYA GANDULES C/ COCO" vs "Guandules Verdes Con Coco Goya"):
    # ese es justamente el punto del barcode — es el único id que no depende de la tienda.
    cands = [_Cand("nombre completamente distinto", ean="07460083780023")]
    assert select_ean_match(target_ean="07460083780023", candidates=cands) is cands[0]


# ── R4: sin EAN exacto NO hay candidato — y ese es todo el cambio ──────────────────────────────
# Antes, si ningún candidato traía el barcode del objetivo, se caía a "el nombre más parecido".
# En una consulta POR BARCODE eso es una adivinanza disfrazada de lookup exacto.
#
# El argumento no es de pureza. El fallback existía para no volver con las manos vacías, y es
# EXACTAMENTE la forma de los cinco bugs que ya pagó la ingesta: un fallback indistinguible del
# resultado real. Le pedimos a la tienda "el artículo con barcode X"; si nos devuelve otra cosa, la
# lectura correcta es "la tienda ignoró el filtro" o "no lo tiene" — NO "encontré el producto". Con
# el fallback, una tienda que ignore `filterByEan` y devuelva su catálogo entero pareceria estar
# cubriendo canónicos, y nadie lo notaría: se vería como cobertura funcionando.
#
# Y la decisión no se toma a ciegas: sin candidato, la Cobertura DESCARTA (no encola), y el producto
# igual se descubre por NOMBRE en el Proceso 1, que sí tiene red de contención humana. La división es
# Cobertura = barcode puro / Descubrimiento = texto.


def test_a_name_lookalike_is_not_a_barcode_match() -> None:
    # El caso que motiva R4: la tienda devolvió algo, pero NO lo que pedimos. Un nombre idéntico no
    # convierte a un SKU distinto en el mismo producto (1 Lb vs 20 Lb del mismo arroz comparten
    # casi todo el nombre y son productos distintos — el size gate de la cascada existe por eso).
    cands = [_Cand("Arroz La Garza Premium 20 Lb", ean="09999999999993")]
    assert select_ean_match(target_ean="07460083780023", candidates=cands) is None


def test_a_candidate_without_a_barcode_is_never_a_match() -> None:
    # Nombre perfecto, sin barcode → no hay nada que verificar → no hay match.
    cands = [_Cand("Arroz La Garza Premium 20 Lb", ean=None)]
    assert select_ean_match(target_ean="07460083780023", candidates=cands) is None


def test_returns_none_when_the_store_answers_nothing() -> None:
    # "Si no se encuentra, se descarta" — el canónico sigue sin cubrir hasta la próxima corrida.
    assert select_ean_match(target_ean="07460083780023", candidates=[]) is None
