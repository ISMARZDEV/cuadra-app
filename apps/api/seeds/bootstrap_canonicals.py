"""DEV: bootstrapea el catálogo canónico desde los `pending_review` de una fuente (arranque en frío).

Para cada match `pending_review` de la fuente que tenga clasificación de categoría activa (Etapa B) y
un tamaño parseable, crea un `canonical_product` nuevo (con esa categoría + cantidad) y enlaza el
match — vía `CreateCanonicalAndLink` (el MISMO use-case que el botón "Crear canónico" del admin).
Así queda un catálogo real contra el cual las OTRAS tiendas pueden matchear.

Uso:  cd apps/api && uv run python -m seeds.bootstrap_canonicals [--provider Sirena]
"""
from __future__ import annotations

import sys

from sqlalchemy import text

from src.contexts.save.application.create_canonical_and_link import (
    CreateCanonicalAndLink,
    NewCanonicalProduct,
)
from src.contexts.save.application.resolve_review import ResolveReview
from src.contexts.save.domain.value_objects import parse_size
from src.contexts.save.infrastructure.matching.repository import SqlProductMatchRepository
from src.contexts.save.infrastructure.repositories import (
    SqlCanonicalProductRepository,
    SqlStoreProductRepository,
)

MARKET = "DO"


def main() -> None:
    provider = sys.argv[sys.argv.index("--provider") + 1] if "--provider" in sys.argv else "Sirena"

    from src.shared.db.base import SessionLocal

    with SessionLocal() as s:
        rows = s.execute(
            text(
                """
                SELECT pm.id::text AS match_id, sp.name, sp.brand, sp.size_text,
                       cc.taxonomy_node_id::text AS tax
                FROM save.product_match pm
                JOIN save.store_product sp ON sp.id = pm.store_product_id
                JOIN save.provider p ON p.id = sp.provider_id
                JOIN save.category_classification cc
                     ON cc.store_product_id = sp.id AND cc.status = 'active'
                WHERE p.name ILIKE :pn AND pm.status = 'pending_review'
                """
            ),
            {"pn": provider},
        ).all()

        use_case = CreateCanonicalAndLink(
            canonical_repo=SqlCanonicalProductRepository(s),
            resolver=ResolveReview(SqlProductMatchRepository(s), SqlStoreProductRepository(s)),
        )

        created = skipped = 0
        for r in rows:
            try:
                qty = parse_size(r.size_text or "")
            except ValueError:
                skipped += 1
                continue
            use_case.execute(
                match_id=r.match_id,
                product=NewCanonicalProduct(
                    name=r.name or "(sin nombre)",
                    brand=r.brand or "",
                    quantity=qty,
                    taxonomy_node_id=r.tax,
                    market_id=MARKET,
                    display_size=r.size_text,
                ),
                decided_by="bootstrap",
            )
            created += 1
        s.commit()
        print(f"bootstrap «{provider}»: {created} canónicos creados + enlazados · {skipped} saltados (tamaño no parseable).")


if __name__ == "__main__":
    main()
