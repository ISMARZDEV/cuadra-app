"""Banding por umbral del score final (fusionado + boosteado) — F2.0 matching cascade. PURA.

Clasifica el score final (salida de `scoring.apply_boosts`) en la banda de decisión que
determina la siguiente etapa de la cascada (ver design §Cascade Contract, paso 5):

- score >= HIGH (0.85)        -> "auto_link" (enlace automático, sin intervención humana/LLM)
- MID (0.55) <= score < HIGH  -> "grey"      (banda gris: se envía al LLM judge)
- score < MID, o sin score    -> "human"     (cola de revisión humana)

`score=None` representa el caso de lista de candidatos VACÍA (no hubo ningún match trgm/vector
que fusionar) — se trata igual que un score bajo: directo a la cola humana.

Los umbrales son constantes nombradas (no mágicas) porque están pendientes de afinar una vez
exista el labeled set del curated basket (ver design §Open Questions).

`JUDGE_MATCH_MIN_CONFIDENCE` (verify follow-up, CRITICAL-1): piso de confianza que un veredicto
`decision="match"` del LLM judge debe alcanzar para autolinkear. Sin este piso, una banda gris
(que arranca en MATCH_MID_THRESHOLD=0.55) podía autolinkear con un "match" del judge de baja
confianza propia — violando la regla sagrada #4 (nada débilmente confiado se auto-mergea). Tuned
en Batch 10 con datos reales del curated basket; hasta entonces, valor conservador provisional.
"""
from __future__ import annotations

from typing import Literal

MATCH_HIGH_THRESHOLD = 0.85
MATCH_MID_THRESHOLD = 0.55
JUDGE_MATCH_MIN_CONFIDENCE = 0.70

MatchBand = Literal["auto_link", "grey", "human"]


def determine_band(score: float | None) -> MatchBand:
    """Determina la banda de decisión para `score` (None = lista de candidatos vacía)."""
    if score is None:
        return "human"
    if score >= MATCH_HIGH_THRESHOLD:
        return "auto_link"
    if score >= MATCH_MID_THRESHOLD:
        return "grey"
    return "human"
