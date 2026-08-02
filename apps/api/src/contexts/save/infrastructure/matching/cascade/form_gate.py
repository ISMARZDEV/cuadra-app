"""Form gate de la cascada de matching (PURO).

La FORMA de preparación distingue SKUs que comparten marca, tamaño, categoría, color y especie:
harina de arroz no es arroz, y habichuelas guisadas (en salsa, listas para comer) no son
habichuelas secas. Ningún gate anterior cubría este eje — ni el de variante (mismo color, misma
especie), ni el de calidad (misma línea), ni el de tamaño (los tamaños COINCIDEN).

Medido 2026-08-01, primera corrida con el juez encendido (Sirena → 97 canónicos → Nacional+Bravo):

  · `GOYA HARINA ARROZ 24OZ`          → `Arroz Goya Valencia 24 Oz`         (llm,    0.850)
  · `Habichuelas Rojas Guisadas Goya` → `Habichuelas Rojas Red Kidney Goya` (llm,    0.850)
  · `Guandules Verdes Guisados Goya`  → `Guandules Verdes Goya 15 Oz`       (hybrid, 0.902)

Los dos primeros los produjo el JUEZ; el tercero la cascada DETERMINISTA. El eje falla en ambos
caminos, así que la respuesta no es afinar el LLM sino un gate — y no es afinar un umbral: las
confianzas de los falsos (0.850, 0.850, 0.902) están mezcladas con las de los aciertos (0.900,
0.900, 0.850, 0.800). Es la misma lección que dejó el piso 0.85 de la cascada: **ningún umbral
separa esta clase de error; los gates estructurales sí.**

ASIMETRÍA DELIBERADA — no-marcado significa la forma BASE. Es la diferencia de fondo con
`variant_gate` y la razón de que esto viva aparte. Allá, un lado sin color significa "no sabemos" y
NO se bloquea (contradicción POSITIVA obligatoria). Acá, un nombre sin marca de forma nombra el
producto base: "Arroz" a secas ES grano, no "arroz de forma desconocida". Por eso
marcado-vs-no-marcado SÍ es contradicción, y por eso los 3 casos medidos —los tres con un lado sin
marcar— serían invisibles para la semántica de `variant_gate`. Misma asimetría que `brand_gate`,
que bloquea por AUSENCIA de evidencia.

SEGURIDAD MEDIDA: simulado sobre los 126 enlaces `auto_linked` de esa corrida, bloquea EXACTAMENTE
esos 3 y no rompe ningún enlace bueno. `harina` toca 1 y `guisado` 2; el resto de los marcadores no
toca ninguno en esta canasta (arroz y legumbres), y están por pertenecer a la MISMA clase semántica
—transformaciones de un ingrediente base— no por evidencia propia. Si alguno resulta ruidoso al
ensanchar la canasta, la corrección es sacarlo de `_FORM_MARKERS`, no relajar el contrato.

El match es por PALABRA completa (tokenización), nunca subcadena: "harinado" no es "harina",
"cremoso" no es "crema". Género y número colapsan al mismo valor canónico (guisada/guisados →
"guisado"): no son una diferencia de producto.
"""
from __future__ import annotations

import re

# Forma-de-superficie → valor canónico. MEDIDOS: `harina` (1 falso merge), `guisado` (2). El resto
# son la misma clase semántica —una transformación que produce otro SKU a partir del mismo
# ingrediente— y no aparecen en la canasta de arroz y legumbres con la que se midió.
_FORM_MARKERS: dict[str, str] = {
    "harina": "harina", "harinas": "harina",
    "guisado": "guisado", "guisada": "guisado",
    "guisados": "guisado", "guisadas": "guisado",
    "molido": "molido", "molida": "molido",
    "molidos": "molido", "molidas": "molido",
    "pasta": "pasta", "pastas": "pasta",
    "pure": "pure", "puré": "pure",
    "crema": "crema", "cremas": "crema",
    "leche": "leche",
    "jugo": "jugo", "jugos": "jugo",
    "aceite": "aceite", "aceites": "aceite",
    "salsa": "salsa", "salsas": "salsa",
}

_TOKEN_RE = re.compile(r"[a-záéíóúñ]+")


def _forms(name: str) -> frozenset[str]:
    """Marcadores de forma presentes en `name` (match por palabra completa). Vacío = forma BASE."""
    return frozenset(
        _FORM_MARKERS[t] for t in _TOKEN_RE.findall(name.casefold()) if t in _FORM_MARKERS
    )


def forms_conflict(name_a: str, name_b: str) -> bool:
    """`True` = los nombres describen FORMAS distintas del producto (distinto SKU → NO auto-linkear).

    A diferencia de `variants_conflict`, el conjunto VACÍO no es "sin señal" sino un valor propio —
    la forma base— así que difiere de cualquier conjunto marcado. Ver la nota de asimetría del
    módulo.
    """
    return _forms(name_a) != _forms(name_b)
