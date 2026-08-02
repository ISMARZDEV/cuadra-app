"""DEV: re-corre la cascada de matching sobre los `pending_review` contra el catálogo ACTUAL.

Cubre un hueco operativo real: `RefreshCatalogPrices` sólo enruta al matcher los `store_product`
DESCONOCIDOS (`exists(provider_id, external_id)`), así que un producto que quedó en la cola cuando
el catálogo era chico **no se vuelve a evaluar nunca**, por más canónicos que se creen después.
Hasta ahora la única salida era `DiscardStoreProduct` (borra y libera la identidad), que además
pierde el histórico de precios.

Es idempotente por construcción: `record_match` hace upsert y `record_candidates` reemplaza el set
(borra los previos antes de insertar), así que re-correr no duplica nada.

Embebe primero los canónicos sin `embedding` — sin eso la etapa vectorial no los ve y el re-match
mediría un catálogo a medias.

Uso:
    cd apps/api && uv run python -m seeds.rematch_pending [--provider Bravo] [--limit 500]
"""
from __future__ import annotations

import sys

from sqlalchemy import text

from src.contexts.save.application.match_store_product import IncomingStoreProduct

_PENDING = """
SELECT sp.id::text AS spid, sp.name, sp.brand, sp.size_text, sp.ean,
       sp.source_category, sp.provider_id::text AS provider_id
  FROM save.product_match pm
  JOIN save.store_product sp ON sp.id = pm.store_product_id
  JOIN save.provider p ON p.id = sp.provider_id
 WHERE pm.status = 'pending_review'
   AND (:provider = '' OR p.name ILIKE :provider)
 ORDER BY sp.id
 LIMIT :limit
"""


def main() -> None:
    provider = sys.argv[sys.argv.index("--provider") + 1] if "--provider" in sys.argv else ""
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 1000

    from ingestion.save.composition import build_canonical_embedder, build_matcher
    from ingestion.save.sources import SAVE_MARKET
    from src.shared.db.base import SessionLocal

    with SessionLocal() as s:
        embedder = build_canonical_embedder(s)
        if embedder is not None:
            print(f"embebidos {embedder.execute(SAVE_MARKET)} canónicos nuevos (índice semántico)")
            s.commit()

        matcher = build_matcher(s)
        if matcher is None:
            print("cascada de matching DARK (`SAVE_MATCHING_CASCADE_ENABLED=false`) — nada que hacer.")
            return

        filas = s.execute(
            text(_PENDING), {"provider": provider or "", "limit": limit}
        ).all()
        print(f"re-matcheando {len(filas)} pendientes" + (f" de «{provider}»" if provider else ""))

        enlazados = encolados = 0
        for i, f in enumerate(filas, start=1):
            resultado = matcher.execute(
                IncomingStoreProduct(
                    store_product_id=f.spid,
                    market_id=SAVE_MARKET,
                    name=f.name or "",
                    brand=f.brand or "",
                    size=f.size_text or "",
                    ean=f.ean,
                    source_category=f.source_category or "",
                    provider_id=f.provider_id,
                )
            )
            if resultado.status == "auto_linked":
                enlazados += 1
            else:
                encolados += 1
            if i % 100 == 0:
                print(f"  {i}/{len(filas)} · enlazados={enlazados} en cola={encolados}")
                s.commit()

        s.commit()
        print(f"\n✓ auto-enlazados {enlazados} · siguen en cola {encolados}")


if __name__ == "__main__":
    main()
