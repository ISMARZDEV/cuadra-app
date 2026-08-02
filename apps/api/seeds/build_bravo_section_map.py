"""DEV: construye el mapa `subfamiliaArticulo → nombre de sección` de Bravo (2026-08-02).

POR QUÉ EXISTE
--------------
Bravo entra por el camino de CANASTA (`/public/articulo/search`), y ese endpoint devuelve
`familiaArticulo` (`GR`) y `subfamiliaArticulo` (`GR-010`) pero **no la sección**. Por eso los
productos de Bravo quedaban con `source_category = 'FV > FV-005'`: códigos internos que el
clasificador no puede leer, o sea CERO señal de origen.

La sección legible sí existe, pero en otro endpoint (`/public/seccion/list` → `nombreSeccion`) y
sólo se sabe a qué sección pertenece un artículo NAVEGANDO por sección (`/public/articulo/list?
model.filterByIdSeccion=..`). No hay catálogo de familias: `/public/{familia,subfamilia,categoria,
grupo,departamento}/list` devuelven **HTTP 500** (sondeado 2026-08-02).

Entonces el mapa se DERIVA: se navega el catálogo completo una vez, se anota en qué sección aparece
cada subfamilia, y se emite un módulo de datos revisable. Después la ingesta por canasta resuelve la
sección con un dict, sin pagar una sola request extra — `subfamiliaArticulo` viene en el **100%** de
los resultados de `/search` (verificado sobre 30 artículos de 3 términos distintos).

Uso:
    cd apps/api && uv run python -m seeds.build_bravo_section_map            # imprime el resumen
    cd apps/api && uv run python -m seeds.build_bravo_section_map --write    # además escribe el módulo
"""
from __future__ import annotations

import gzip
import json
import sys
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

from sqlalchemy import text

from src.contexts.save.infrastructure.catalog_sources.pacing import build_pace

# Secciones TRANSVERSALES: un producto aparece en la suya Y en éstas, así que contarlas ensucia el
# voto. Medido: casi toda la ambigüedad observada era contra «Alimentación general», el cajón de
# sastre de Bravo (`GR-003 → {Alimentación general, Granos}`). Excluirlas subió las subfamilias
# inequívocas de 62% a 69%.
GENERIC_SECTIONS = frozenset({
    "Alimentación general",
    "Productos Nuevos",
    "OFERTAS",
    "Aniversario Arca",
    "Arca",
    "PROMOCIÓN 3X2 (DEBES PEDIR 3)",
    "PROMOCION 2X1 (DEBES PEDIR 2)",
    "Bodega (Vinos 3X2)",
    "Cafetería Bravo",
    "Vida sana",
    # Pasillos de MARCA, no categorías (2026-08-02). Bravo le da sección propia a cada marca de
    # comida de perro, y eso partía el voto de un concepto único:
    #   AR-002 → {Pro Plan 30, Royal Canin 79, Taste of the Wild 40, Comida mascotas 19}
    # Ninguna llegaba al 70% y la subfamilia quedaba sin mapear, cuando en realidad TODAS dicen lo
    # mismo. Excluyéndolas, el voto se concentra en la sección que sí nombra la categoría.
    "Pro Plan caninos",
    "Royal Canin caninos",
    "Taste of the Wild caninos",
})

# Política de ambigüedad — espeja la regla sagrada del módulo: ante duda, NO inventar.
MAJORITY = 0.70   # la sección dominante debe llevarse al menos este porcentaje
MIN_SAMPLES = 5   # ...y con menos de esta muestra, una "mayoría" no significa nada

_PAGE = 100  # `paginationMaxItems=200` da typeMismatch; 100 es el máximo que acepta

_TARGET = (
    Path(__file__).resolve().parents[1]
    / "src/contexts/save/infrastructure/catalog_sources/bravova_sections.py"
)


def _fetch(url: str, headers: dict[str, str]) -> dict:
    req = urllib.request.Request(url)
    for key, value in headers.items():
        req.add_header(key, value)
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 — host del registry
        raw = resp.read()
        # El registry manda `Accept-Encoding: gzip` y urllib NO descomprime solo.
        if resp.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        return json.loads(raw)


def _registry() -> tuple[str, dict, dict[str, str]]:
    from src.shared.db.base import SessionLocal

    with SessionLocal() as session:
        row = session.execute(
            text(
                "SELECT sr.base_url, sr.endpoints, sr.headers, sr.auth FROM save.store_registry sr "
                "JOIN save.provider p ON p.id = sr.provider_id WHERE p.name = 'Bravo'"
            )
        ).first()
    if row is None:
        raise SystemExit("✖ Bravo no está en store_registry — sembrá el registry primero.")
    base_url, endpoints, headers, auth = row
    merged = dict(headers or {})
    if auth:
        merged[auth["name"]] = auth["value"]
    return base_url, endpoints or {}, merged


def _section_names(base_url: str, headers: dict[str, str]) -> dict[str, str]:
    query = urllib.parse.urlencode(
        {"paginationMaxItems": str(_PAGE), "paginationOffset": "0", "showOrder": "ordenSeccion asc"}
    )
    payload = _fetch(f"{base_url}/public/seccion/list?{query}", headers)
    rows = (payload.get("data") or {}).get("list") or []
    return {str(r["idSeccion"]): (r.get("nombreSeccion") or "") for r in rows}


def _tally(base_url: str, endpoints: dict, headers: dict[str, str]) -> dict[str, Counter[str]]:
    """`{subfamilia: Counter(nombre de sección)}` navegando TODAS las secciones, paginando completo."""
    names = _section_names(base_url, headers)
    pace = build_pace()
    tally: dict[str, Counter[str]] = defaultdict(Counter)
    sections = endpoints.get("sections") or []

    for i, section_id in enumerate(sections, 1):
        section = names.get(str(section_id), "")
        if section in GENERIC_SECTIONS:
            print(f"  [{i}/{len(sections)}] {section!r}: TRANSVERSAL, se salta")
            continue
        offset, seen = 0, 0
        while True:
            pace()
            params = {
                "model.filterByIdSeccion": section_id,
                "model.filterByIdTienda": "1000",
                "paginationMaxItems": str(_PAGE),
                "paginationOffset": str(offset),
                "showOrder": "importerankingArticulo asc",
            }
            url = f"{base_url}/public/articulo/list?" + urllib.parse.urlencode(params)
            try:
                payload = _fetch(url, headers)
            except Exception as exc:  # noqa: BLE001 — una sección caída no aborta el mapa entero
                print(f"      ✖ {section!r} offset={offset}: {type(exc).__name__} — se corta acá")
                break
            items = (payload.get("data") or {}).get("list") or []
            total = (payload.get("data") or {}).get("totalCount") or 0
            for item in items:
                sub = str(item.get("subfamiliaArticulo") or "").strip()
                if sub and section:
                    tally[sub][section] += 1
            seen += len(items)
            offset += _PAGE
            if not items or offset >= total:
                break
        print(f"  [{i}/{len(sections)}] {section!r}: {seen} artículos")
    return tally


def _decide(tally: dict[str, Counter[str]]) -> tuple[dict[str, tuple[str, int, str]], list[str]]:
    """`{subfamilia: (sección, n, nota)}` + las subfamilias que quedan SIN mapear."""
    mapped: dict[str, tuple[str, int, str]] = {}
    skipped: list[str] = []
    for sub, counter in sorted(tally.items()):
        total = sum(counter.values())
        section, n = counter.most_common(1)[0]
        if len(counter) == 1:
            mapped[sub] = (section, n, "")
        elif n >= MAJORITY * total and total >= MIN_SAMPLES:
            resto = ", ".join(f"{s} {c}" for s, c in counter.most_common()[1:])
            mapped[sub] = (section, n, f"{n}/{total} (compite: {resto})")
        else:
            skipped.append(f"{sub}: {dict(counter)}")
    return mapped, skipped


def _render(mapped: dict[str, tuple[str, int, str]], skipped: list[str]) -> str:
    lines = [
        '"""Mapa `subfamiliaArticulo → sección` de Bravo. GENERADO — no editar a mano.',
        "",
        "Lo produce `seeds/build_bravo_section_map.py` navegando el catálogo completo. Existe porque",
        "el camino de CANASTA (`/public/articulo/search`) devuelve la subfamilia pero NO la sección, y",
        "sin sección Bravo no aporta señal de ORIGEN al clasificador. Bravo no publica catálogo de",
        "familias (`/public/familia/list` → HTTP 500), así que el mapa se DERIVA de los datos.",
        "",
        "Una subfamilia entra sólo si aparece en UNA sola sección, o si una se lleva",
        f"≥{int(MAJORITY * 100)}% con ≥{MIN_SAMPLES} muestras (ahí va anotado el reparto). Lo demás NO se mapea:",
        "el producto cae al nombre/vector/juez, que es la regla sagrada — ante duda, no inventar.",
        "",
        "Las secciones TRANSVERSALES (Alimentación general, OFERTAS, promociones…) se excluyen del",
        "conteo: un producto vive en la suya Y en ésas, y contarlas ensucia el voto.",
        '"""',
        "from __future__ import annotations",
        "",
        "SUBFAMILY_SECTIONS: dict[str, str] = {",
    ]
    for sub, (section, n, note) in sorted(mapped.items()):
        comment = f"  # {note}" if note else f"  # n={n}"
        lines.append(f'    {sub!r}: {section!r},{comment}')
    lines += [
        "}",
        "",
        "# SIN mapear por ambigüedad real (no ruido): la subfamilia vive de verdad en varias secciones.",
        "# p.ej. la fórmula infantil es Bebés Y Lácteos; el agua es Bebés Y Agua y refrescos.",
    ]
    for row in skipped:
        lines.append(f"#   {row}")
    lines += [
        "",
        "",
        "def section_for_subfamily(code: str) -> str | None:",
        '    """Nombre de sección para una subfamilia, o `None` si no está mapeada (ambigua o nueva)."""',
        "    return SUBFAMILY_SECTIONS.get(code.strip()) if code else None",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    base_url, endpoints, headers = _registry()
    print(f"navegando {len(endpoints.get('sections') or [])} secciones de Bravo…\n")
    tally = _tally(base_url, endpoints, headers)
    mapped, skipped = _decide(tally)

    total = len(tally)
    print(f"\nsubfamilias vistas: {total}")
    print(f"  mapeadas    : {len(mapped)} ({len(mapped) / max(total, 1) * 100:.0f}%)")
    print(f"  sin mapear  : {len(skipped)}")

    if "--write" in sys.argv:
        _TARGET.write_text(_render(mapped, skipped), encoding="utf-8")
        print(f"\n✓ escrito {_TARGET.relative_to(Path.cwd().parent)}")
    else:
        print("\n(dry-run — nada escrito. Agregá --write para generar el módulo.)")


if __name__ == "__main__":
    main()
