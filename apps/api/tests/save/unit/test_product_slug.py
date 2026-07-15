"""Unit — `product_slug`: slug legible y URL-safe del producto canónico (SEO, ancla F1).

El slug es la llave PÚBLICA del producto en la URL (`/product/arroz-selecto-wala-5-lb`) en vez
del UUID. Se deriva de nombre + marca + tamaño original, reusando el mismo `slugify` que la
taxonomía. La UNICIDAD (sufijo en colisión) NO vive acá — es responsabilidad de quien inserta
(seed/repo), que conoce los slugs existentes. Este helper solo produce el slug BASE determinista.
"""
from __future__ import annotations

from src.contexts.save.domain.slug import product_slug


def test_slug_combines_name_brand_and_size() -> None:
    assert product_slug("Arroz Enriquecido", "Pimco", "10 LB") == "arroz-enriquecido-pimco-10-lb"


def test_slug_omits_brand_already_present_in_name() -> None:
    # "Arroz La Garza" ya contiene la marca → no la duplicamos ("...-la-garza-la-garza-...").
    assert product_slug("Arroz La Garza", "La Garza", "10 LB") == "arroz-la-garza-10-lb"


def test_slug_without_size() -> None:
    assert product_slug("Leche Rica", "Rica") == "leche-rica"


def test_slug_strips_accents_and_symbols() -> None:
    assert product_slug("Café Molido Santo Domingo", "Induban", "1 Lb") == (
        "cafe-molido-santo-domingo-induban-1-lb"
    )


def test_slug_only_name_when_no_brand_no_size() -> None:
    assert product_slug("Habichuela Roja") == "habichuela-roja"
