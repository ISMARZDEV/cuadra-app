"""Seed de la taxonomía canónica REAL de Save (save-category-classification, Batch 2).

Puebla `taxonomy_node` con las 15 categorías tope + subcategorías de
`docs/research/save-fable/Categorias_y_Subcategorias.md` (2 niveles), para `market_id="DO"`.

IDEMPOTENTE y COMPATIBLE con el seed demo: reusa `_taxonomy_leaf` (mismo namespace `_NS` +
esquema `uuid5(taxonomy:{market}/{cat}/{sub})`), así que un nodo ya sembrado por `save_seed`
(p.ej. "Despensa & Abarrotes" / "Arroz, Granos & Legumbres") obtiene el MISMO id — sin
duplicar, sin conflicto. Las hojas más profundas de la demo quedan como hijos extra.

Correr: `uv run python -m seeds.save_taxonomy_seed` (o vía el orquestador de seeds).
"""
from __future__ import annotations

import re
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from seeds.save_seed import _NS
from src.contexts.save.infrastructure.models import (
    TaxonomyNodeMarketModel,
    TaxonomyNodeModel,
)

# apps/api/seeds/save_taxonomy_seed.py → parents[3] = raíz del repo
_MD_PATH = (
    Path(__file__).resolve().parents[3]
    / "docs/research/save-fable/Categorias_y_Subcategorias.md"
)


# `Etiqueta `key`` — la key va al final entre backticks. Es la IDENTIDAD del nodo; la etiqueta es
# sólo presentación. Ver `docs/research/save-fable/taxonomia-multi-idioma.md`.
_KEYED = re.compile(r"^(?P<label>.+?)\s+`(?P<key>[a-z0-9][a-z0-9.\-]*)`$")

NodeSpec = tuple[str, str]  # (etiqueta, key)
CategorySpec = tuple[NodeSpec, list[NodeSpec]]


def _split(line: str, kind: str) -> NodeSpec:
    """`Etiqueta \\`key\\`` → (etiqueta, key). Sin key es un ERROR, nunca se adivina.

    Derivar la key del nombre reintroduciría exactamente el bug que la key existe para eliminar:
    renombrar la etiqueta cambiaría la identidad y el seed crearía un nodo nuevo, orfanando el
    viejo (pasó 10 veces el 2026-08-01).
    """
    hit = _KEYED.match(line)
    if hit is None:
        raise ValueError(f"{kind} sin key en el markdown de taxonomía: {line!r}")
    return hit.group("label").strip(), hit.group("key")


def parse_taxonomy(md_text: str) -> list[CategorySpec]:
    """`## Categoría \\`key\\`` → categoría; `- Subcategoría \\`key\\`` → subcategoría.

    Ignora el `#` (h1), los blancos y las citas (`>`, el header normativo del documento).
    """
    entries: list[CategorySpec] = []
    current: CategorySpec | None = None
    for raw in md_text.splitlines():
        line = raw.strip()
        if not line or line.startswith(">"):
            continue
        if line.startswith("## "):
            current = (_split(line[3:].strip(), "categoría"), [])
            entries.append(current)
        elif line.startswith("-") and current is not None:
            sub = line.lstrip("-").strip()
            if sub:
                current[1].append(_split(sub, "subcategoría"))
    return entries


def load_taxonomy_entries() -> list[CategorySpec]:
    return parse_taxonomy(_MD_PATH.read_text(encoding="utf-8"))


def _upsert_node(
    session: Session,
    market_id: str,
    spec: NodeSpec,
    *,
    level: int,
    parent_id: uuid.UUID | None,
) -> uuid.UUID:
    """Crea o actualiza el nodo identificado por (market_id, key). Devuelve su id.

    La búsqueda es por KEY, nunca por nombre: por eso renombrar una etiqueta ACTUALIZA el nodo en
    vez de crear uno nuevo. El id sólo se calcula al nacer (uuid5 de la key, para que dev y prod
    coincidan) y después es OPACO — corregir una key más adelante es un UPDATE de texto, sin tocar
    ids ni orfanar nada.
    """
    label, key = spec
    node = session.scalar(select(TaxonomyNodeModel).where(TaxonomyNodeModel.key == key))
    if node is None:
        node = TaxonomyNodeModel(
            id=uuid.uuid5(_NS, f"taxonomy-key:{key}"),
            parent_id=parent_id,
            name=label,
            key=key,
            level=level,
        )
        session.add(node)
    else:
        node.name = label  # renombrar es sólo cambiar la etiqueta: la identidad es la key
        node.parent_id = parent_id
        node.level = level
    session.flush()

    # Fase 2b: el concepto es GLOBAL, pero cada mercado declara que LO LLEVA. Sin esta fila el
    # nodo existe y nadie lo ve — `list_tree` filtra por (mercado, active).
    if session.get(TaxonomyNodeMarketModel, (node.id, market_id)) is None:
        session.add(TaxonomyNodeMarketModel(node_id=node.id, market_id=market_id, active=True))
        session.flush()
    return node.id


def seed_taxonomy(
    session: Session,
    market_id: str = "DO",
    entries: list[CategorySpec] | None = None,
) -> int:
    """Crea/actualiza (idempotente) categorías tope + subcategorías. Devuelve el nº de tope."""
    entries = entries if entries is not None else load_taxonomy_entries()
    for category, subcategories in entries:
        parent_id = _upsert_node(session, market_id, category, level=0, parent_id=None)
        for subcategory in subcategories:
            _upsert_node(session, market_id, subcategory, level=1, parent_id=parent_id)
    return len(entries)


def main() -> None:
    from src.shared.db.base import SessionLocal

    with SessionLocal() as session:
        count = seed_taxonomy(session, market_id="DO")
        session.commit()
    print(f"seed: taxonomía Save OK ({count} categorías tope, idempotente).")


if __name__ == "__main__":
    main()
