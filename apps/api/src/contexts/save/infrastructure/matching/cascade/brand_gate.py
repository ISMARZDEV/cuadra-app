"""Brand gate de la cascada de matching (PURO).

El falso positivo medido 2026-07-21 (aispace-men #822): `ARROZ SELECTO 10 LB` de Bravo auto-linkeó
a `Arroz Selecto Wala 10 Lb` en 0.850. Bravo no declara marca y su nombre no nombra a Wala por
ningún lado — CERO evidencia de que ese arroz sea Wala — pero las cadenas difieren en UN token (el
de la marca), así que trgm y el vector coincidieron en verlas casi idénticas y el score alcanzó el
piso. Es el mismo mecanismo que el falso positivo gandules→habichuela, en otro eje: el token que
DISCRIMINA es justo el que falta.

**Contrato distinto al de los otros cuatro gates.** `sizes_conflict`, `categories_conflict`,
`variants_conflict` y `_ean_conflicts` bloquean ante CONTRADICCIÓN positiva (ambos lados conocidos y
distintos); éste bloquea ante AUSENCIA de evidencia. La asimetría es deliberada: un canónico CON
marca es un SKU de esa marca, y mergearle adentro un producto que no la corrobora por ningún lado es
exactamente el "auto-merge con señal débil" que la regla sagrada #4 prohíbe. Ante la duda el costo
es una revisión humana; el costo del error inverso es un falso merge, que corrompe para siempre toda
comparación de precios construida encima.

Corroborar es barato porque las cadenas que NO declaran marca igual la escriben en el nombre (Bravo
al principio, Nacional en el medio) — por eso el gate mira el campo marca Y el nombre antes de
bloquear, y por eso los 11 matches BUENOS de aquella corrida lo atraviesan sin despeinarse.

Si el canónico no declara marca (genéricos: produce suelto, pan de la casa) no hay nada que
corroborar y el gate nunca dispara.
"""
from __future__ import annotations

from ....domain.brand_from_name import brand_appears_in


def brand_unsupported(
    store_brand: str, store_name: str, canonical_brand: str | None
) -> bool:
    """`True` = el canónico declara marca y el store NO la corrobora — ni en su campo marca ni en
    su nombre → sin evidencia de marca, NO auto-linkear. Ver el docstring del módulo."""
    if not canonical_brand or not canonical_brand.strip():
        return False
    if brand_appears_in(canonical_brand, store_brand):
        return False
    return not brand_appears_in(canonical_brand, store_name)
