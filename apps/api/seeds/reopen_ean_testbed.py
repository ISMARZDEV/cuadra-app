"""DEV: banco de pruebas de la etapa EAN — devuelve a la cola lo que SÍ puede volver por EAN.

La etapa EAN no compara contra el canónico (`canonical_product` ni siquiera tiene columna `ean`):
busca **otro `store_product` con el mismo EAN que YA esté enlazado**. Sin esa CONTRAPARTE la etapa
no puede disparar — y por eso un re-match sobre filas cuyo EAN es exclusivo de su tienda enlaza
casi nada, sin que haya nada roto.

Este seed selecciona justamente las filas que SÍ tienen contraparte y las devuelve a la cola, para
poder ejercitar la etapa end-to-end sin esperar datos nuevos. Es AUTO-REPARABLE: correr
«Re-evaluar seleccionados» sobre ellas debería volver a enlazarlas por `ean` con confianza 1.0.
Si alguna vuelve por `trgm`/`llm` en vez de `ean`, hay un problema real en la etapa.

POR QUÉ `UnlinkStoreProduct` Y NO `reopen_review`. `reopen_review` limpia el canónico del MATCH pero
deja `store_product.canonical_product_id` puesto, y la etapa EAN mira ESE campo: el producto sería
su PROPIO puente y la prueba daría un falso verde. `UnlinkStoreProduct` limpia las dos puntas en la
misma UoW y además exige motivo, así que la reapertura queda trazada.

Uso:
    cd apps/api && uv run python -m seeds.reopen_ean_testbed [--provider Bravo] [--apply]
"""
from __future__ import annotations

import sys

from sqlalchemy import text

from src.contexts.save.application.unlink_store_product import UnlinkStoreProduct
from src.contexts.save.infrastructure.matching.repository.product_match_repository import (
    SqlProductMatchRepository,
)
from src.contexts.save.infrastructure.repositories import SqlStoreProductRepository

# Motivo con el que se traza la reapertura. `other` porque no es un error del matcher: es una
# reapertura deliberada para probar.
REASON_CODE = "other"
REASON_NOTE = "Devuelto a la cola a propósito para probar la etapa EAN del re-match."

# Enlazados cuyo EAN existe en OTRA tienda con enlace vivo → tienen contraparte disponible.
# `:provider = ''` = cualquier proveedor: el puente es por MERCADO, no por tienda.
CON_CONTRAPARTE = """
SELECT sp.id::text AS spid, sp.name, sp.ean, pm.method, pm.id::text AS mid, p.name AS provider
  FROM save.store_product sp
  JOIN save.provider p ON p.id = sp.provider_id
  JOIN save.product_match pm ON pm.store_product_id = sp.id
 WHERE sp.canonical_product_id IS NOT NULL
   AND sp.ean IS NOT NULL AND sp.ean <> ''
   AND (:provider = '' OR p.name ILIKE :provider)
   AND EXISTS (
     SELECT 1 FROM save.store_product o
      WHERE o.ean = sp.ean AND o.id <> sp.id AND o.canonical_product_id IS NOT NULL
   )
 ORDER BY p.name, sp.name
"""


def find_candidates(session, provider_name: str = ""):  # type: ignore[no-untyped-def]
    return session.execute(text(CON_CONTRAPARTE), {"provider": provider_name or ""}).all()


def run(session, *, execute: bool, provider_name: str = ""):  # type: ignore[no-untyped-def]
    """Devuelve las filas candidatas. Con `execute=False` no escribe nada.

    `provider_name` es OBLIGATORIO para escribir, y no es burocracia: en un par que comparte EAN,
    cada lado es la contraparte del otro, así que desenlazar sin acotar se lleva LAS DOS PUNTAS y
    destruye el puente — el banco de prueba quedaría inservible y ninguna fila podría volver por
    EAN. Acotar a una tienda deja la otra de puente, que es justamente lo que se quiere probar.
    """
    if execute and not provider_name.strip():
        raise ValueError(
            "reopen_ean_testbed: hace falta --provider. Sin acotar, se desenlazan ambos lados de "
            "cada par que comparte EAN y no queda puente contra el cual re-enlazar."
        )
    filas = find_candidates(session, provider_name)
    if not execute:
        return filas

    use_case = UnlinkStoreProduct(
        match_repo=SqlProductMatchRepository(session),
        store_repo=SqlStoreProductRepository(session),
    )
    for f in filas:
        use_case.execute(
            store_product_id=f.spid,
            decided_by="admin:ean-testbed",
            reason_code=REASON_CODE,
            reason_note=REASON_NOTE,
        )
    return filas


def main() -> None:
    apply = "--apply" in sys.argv
    provider = sys.argv[sys.argv.index("--provider") + 1] if "--provider" in sys.argv else ""

    from src.shared.db.base import SessionLocal

    with SessionLocal() as session:
        filas = run(session, execute=apply, provider_name=provider)
        if apply:
            session.commit()

        modo = "APLICADO" if apply else "DRY-RUN (nada escrito)"
        alcance = f" de «{provider}»" if provider else ""
        print(f"[{modo}] candidatos con contraparte EAN enlazada{alcance}: {len(filas)}\n")
        for f in filas:
            print(f"  [{f.provider}] {f.ean}  método actual={f.method:<6} {(f.name or '')[:44]}")
            print(f"      match_id={f.mid}")
        if not apply:
            print("\nRepetir con --apply para devolverlos a la cola.")
            return
        print("\nAhora: seleccionalos en la cola y usá «Re-evaluar seleccionados».")
        print("ESPERADO: vuelven a enlazarse con método `ean` y confianza 100%.")


if __name__ == "__main__":
    main()
