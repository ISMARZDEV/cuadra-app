"""Puente entre los rubros de la canasta (`basket_query.category_label`) y la taxonomía. PURO.

## Por qué existe

La canasta resolvía sus rubros por similitud de NOMBRE, y eso atribuía productos al rubro
equivocado. Medido contra la base el 2026-08-02:

    [Aceites y grasas]    Atún En ACEITE Calvo        ← `word_similarity` = 1.0, y es atún
    [Huevos]              Spaghetti Rica
    [Granos y legumbres]  GALLETA CLAS INTEGRAL        ← 10 galletas entraron como granos
    [Carnes]              2 compotas de bebé, 2 alimentos para perro, 2 platos preparados

**Subir el piso de similitud NO lo arregla**: «Aceite» es una palabra entera dentro de «Atún En
Aceite», así que su score de 1.0 es legítimo. Es el mismo defecto que el token `compr` en el router
y que `arroz` en el léxico de categorías, por tercera vez: **un token que aplica a dos cosas
distintas no discrimina ninguna.**

Y en la canasta duele más que en la búsqueda. Ahí un resultado de más no hace daño; acá un producto
mal atribuido **ocupa el lugar del rubro y desplaza al correcto**, que es exactamente lo que §8.1
prohíbe («jamás rellenar un rubro con otra cosa»).

## La solución

El nombre propone; la **taxonomía dispone**. Un producto solo entra en un rubro si su hoja —o
alguno de sus ancestros— está en el conjunto permitido para ese rubro. Los dos vocabularios no
mapean 1:1 (20 rubros del hogar contra 17 raíces / 138 hojas), así que el puente es una tabla
CURADA, derivada de medir qué hojas caen hoy en cada rubro.

## Degradación

Un rubro **sin mapeo** (por ejemplo uno nuevo, creado desde el admin) NO desaparece: cae al
comportamiento anterior, solo por nombre. Es la degradación segura — un rubro nuevo sigue
resolviendo, aunque con menos precisión, hasta que alguien lo mapee acá.
"""
from __future__ import annotations

from collections.abc import Iterable

# Rubro de la canasta → nombres de nodos de taxonomía permitidos (hoja O ancestro).
# Cuando un rubro entero cabe bajo una RAÍZ, se usa la raíz; donde la raíz sería demasiado
# generosa (p. ej. «Lácteos & Huevos» dejaría entrar huevos en el rubro Lácteos), se enumeran hojas.
ALLOWED_TAXONOMY_BY_GROUP: dict[str, frozenset[str]] = {
    "Aceites y grasas": frozenset({"Aceite & Vinagre"}),
    "Azúcar y endulzantes": frozenset({"Endulzantes"}),
    "Bebidas": frozenset({"Bebidas"}),
    "Bebé": frozenset({"Bebés"}),
    "Café": frozenset({"Café", "Chocolate Para Beber", "Té & Infusiones"}),
    "Carnes": frozenset({"Carnes & Pescados"}),
    "Cereales y avena": frozenset({"Desayuno & Cereal"}),
    "Embutidos": frozenset({"Embutidos & Delicatessen"}),
    "Enlatados y conservas": frozenset({"Enlatados & Conservas"}),
    "Granos y legumbres": frozenset(
        {"Arroz, Granos & Legumbres", "Arroz", "Legumbres", "Granos"}
    ),
    "Harinas y horneo": frozenset({"Harinas", "Repostería"}),
    "Higiene personal": frozenset({"Cuidado Personal"}),
    "Huevos": frozenset({"Huevos"}),
    "Limpieza": frozenset({"Cuidado Del Hogar", "Detergente Infantil De Bebé"}),
    # La raíz «Lácteos & Huevos» dejaría entrar los huevos: se enumeran las hojas lácteas.
    "Lácteos": frozenset(
        {
            "Leche Entera & Descremada",
            "Queso",
            "Yogurt",
            "Mantequilla & Margarina",
            "Crema Agria",
            "Leches Condensadas & Evaporadas",
        }
    ),
    "Panadería y galletas": frozenset({"Panadería & Tortillería", "Galletas & Barras"}),
    "Pastas": frozenset({"Pastas"}),
    "Sal y especias": frozenset({"Condimentos & Especias"}),
    "Salsas y condimentos": frozenset(
        {"Salsas", "Condimentos & Especias", "Untables & Mermeladas"}
    ),
    "Víveres": frozenset({"Víveres", "Frutas Frescas", "Vegetales Frescos"}),
}


def allowed_nodes_for(group: str) -> frozenset[str]:
    """Nodos permitidos para un rubro. Vacío = sin mapeo → no se filtra (degradación segura)."""
    return ALLOWED_TAXONOMY_BY_GROUP.get(group, frozenset())


def is_plausible(group: str, node_chain: Iterable[str]) -> bool:
    """¿Este producto pertenece a este rubro, según su cadena hoja→raíz de taxonomía?

    Un rubro sin mapeo acepta todo: no se puede castigar a un rubro nuevo por no estar curado.
    """
    allowed = allowed_nodes_for(group)
    if not allowed:
        return True
    return any(name in allowed for name in node_chain)


def mapping_pairs() -> tuple[tuple[str, str], ...]:
    """El mapeo aplanado a pares `(rubro, nodo)` — la forma que consume el SQL vía `unnest`."""
    return tuple(
        (group, node)
        for group, nodes in ALLOWED_TAXONOMY_BY_GROUP.items()
        for node in sorted(nodes)
    )
