"""Unit — las marcas que el seed agrega a `save.brand`. PURO, sin DB.

Por qué existe (2026-08-02): tras la primera corrida de `price_refresh` de Bravo, la marca no se
movió (14/52). Medido: `ResolveBrand` corrió sobre los 38 sin marca y resolvió CERO, porque
`save.brand` tenía 33 filas para DO y **la marca blanca de Bravo no estaba entre ellas** — con 13
productos cuyo nombre EMPIEZA con «BRAVO». El resolver hace lo que promete (reconoce, no inventa);
el vocabulario era el que faltaba.

Se testea el DATO y no la escritura: la lista de marcas es configuración. Lo que puede romperse acá
no es el INSERT, es sembrar una marca que no debería existir.
"""
from __future__ import annotations

from seeds.seed_brands import EXCLUDED_ON_PURPOSE, MISSING_BRANDS
from src.contexts.save.domain.brand_from_name import brand_appears_in, build_brand_index, match_brand


def test_seeds_the_private_label_of_the_chain_that_does_not_publish_brand() -> None:
    # 13 de los 38 productos sin marca de Bravo empiezan literalmente con «BRAVO». Sin esta fila,
    # el resolver no puede reconocer la marca propia de la cadena.
    assert "BRAVO" in MISSING_BRANDS


def test_never_seeds_kayama_a_truncation_of_a_brand_already_in_the_catalog() -> None:
    # `KAYAMA FIDEO DE ARROZ 454GR` (Bravo) es el mismo producto que `Fideo De Arroz Okayama 454 G`
    # (Sirena), y OKAYAMA ya existe en el catálogo. Sembrar KAYAMA como marca propia crearía una
    # marca FANTASMA: el brand gate vería KAYAMA vs OKAYAMA como conflicto y bloquearía un enlace
    # legítimo — un falso NEGATIVO fabricado por nosotros.
    assert "KAYAMA" not in MISSING_BRANDS
    assert "KAYAMA" in EXCLUDED_ON_PURPOSE


def test_every_seeded_brand_records_why_it_is_safe_to_add() -> None:
    # Una marca sin motivo documentado es la que nadie se anima a borrar después.
    assert all(MISSING_BRANDS[b].strip() for b in MISSING_BRANDS)
    assert all(EXCLUDED_ON_PURPOSE[b].strip() for b in EXCLUDED_ON_PURPOSE)


def test_no_seeded_brand_is_contained_in_another_one() -> None:
    # Dos marcas donde una contiene a la otra hacen que cuál gana dependa de la POSICIÓN en el
    # nombre, no de cuál es la correcta. Se detecta acá, no en producción.
    for brand in MISSING_BRANDS:
        others = [b for b in MISSING_BRANDS if b != brand]
        assert not any(brand_appears_in(other, brand) for other in others), brand


def test_the_seeded_brands_are_recognizable_by_the_resolver() -> None:
    # Si una marca no sobrevive `build_brand_index` (p.ej. por ser demasiado corta), sembrarla es
    # escribir una fila que el resolver nunca va a mirar.
    index = build_brand_index(MISSING_BRANDS)
    for brand in MISSING_BRANDS:
        assert match_brand(f"{brand} ARROZ 5 LB", index) == brand
