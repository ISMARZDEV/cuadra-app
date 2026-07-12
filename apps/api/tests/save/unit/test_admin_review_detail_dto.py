"""Unit — mapeo de los DTOs del detalle de revisión (rediseño full-stack). PURO, sin DB.

Verifica que `AdminReviewDetailDto.from_detail` y `AdminReviewCandidateDto.from_view` exponen los
campos nuevos del rediseño (SKU/EAN/tienda origen del store_product; imagen/tamaño del candidato).
"""
from __future__ import annotations

from datetime import datetime, timezone

from src.contexts.save.application.dtos import (
    AdminReviewCandidateDto,
    AdminReviewDetailDto,
    AdminReviewQueueRowDto,
)
from src.contexts.save.domain.review_queue import (
    ReviewCandidateView,
    ReviewDetail,
    ReviewQueueRow,
)


def test_candidate_dto_exposes_image_and_size() -> None:
    view = ReviewCandidateView(
        canonical_product_id="c1",
        name="Arroz La Garza 10lb",
        brand="La Garza",
        score=0.72,
        image_url="https://example.com/garza.png",
        size_text="10 LB",
    )

    dto = AdminReviewCandidateDto.from_view(view)

    assert dto.image_url == "https://example.com/garza.png"
    assert dto.size_text == "10 LB"


def test_detail_dto_exposes_sku_ean_and_provider() -> None:
    detail = ReviewDetail(
        match_id="m1",
        store_product_id="sp1",
        confidence=0.85,
        method="llm",
        store_product_name="Arroz Goya Canilla Extra Largo 10 Lb",
        store_product_brand="GOYA",
        store_product_size_text="10 Lb",
        store_product_image_url="https://example.com/goya.png",
        store_product_sku="sku-abc123",
        store_product_ean="7460100000123",
        provider_name="Sirena",
        candidates=[],
    )

    dto = AdminReviewDetailDto.from_detail(detail)

    assert dto.store_product_sku == "sku-abc123"
    assert dto.store_product_ean == "7460100000123"
    assert dto.provider_name == "Sirena"


def test_row_dto_exposes_store_product_url() -> None:
    # F0 (link a la tienda): la fila de la cola lleva el URL para el link "↗" de la tabla.
    row = ReviewQueueRow(
        match_id="m1",
        store_product_id="sp1",
        confidence=0.72,
        method="llm",
        provider_id="p1",
        provider_name="Sirena",
        store_product_name="Arroz Goya 10 Lb",
        store_product_brand="GOYA",
        store_product_size_text="10 Lb",
        candidate_count=2,
        created_at=datetime(2026, 7, 12, tzinfo=timezone.utc),
        store_product_url="https://sirena.do/arroz-goya-10lb/p",
    )

    dto = AdminReviewQueueRowDto.from_row(row)

    assert dto.store_product_url == "https://sirena.do/arroz-goya-10lb/p"


def test_detail_dto_exposes_store_product_url() -> None:
    # F0 (link a la tienda): el detalle lleva el URL del producto en la tienda origen para el
    # botón "↗ Ver en la tienda" del StoreProductPanel.
    detail = ReviewDetail(
        match_id="m1",
        store_product_id="sp1",
        confidence=0.85,
        method="llm",
        store_product_name="Arroz Goya Canilla Extra Largo 10 Lb",
        store_product_brand="GOYA",
        store_product_size_text="10 Lb",
        store_product_image_url="https://example.com/goya.png",
        store_product_sku="sku-abc123",
        store_product_ean="7460100000123",
        store_product_url="https://sirena.do/arroz-goya-canilla-10lb/p",
        provider_name="Sirena",
        candidates=[],
    )

    dto = AdminReviewDetailDto.from_detail(detail)

    assert dto.store_product_url == "https://sirena.do/arroz-goya-canilla-10lb/p"


def test_detail_dto_exposes_market_and_suggested_category() -> None:
    # Etapa A: el detalle lleva el market (para crear el canónico) + la categoría SUGERIDA
    # (la clasificación activa del store_product, Etapa B) = default del selector de categoría.
    detail = ReviewDetail(
        match_id="m1",
        store_product_id="sp1",
        confidence=0.5,
        method="human",
        store_product_name="Arroz La Garza Premium 20 Lbs",
        store_product_brand="LA GARZA",
        store_product_size_text="20 Lbs",
        store_product_image_url=None,
        store_product_sku="sku-1",
        store_product_ean="7460083780023",
        provider_name="Sirena",
        market_id="DO",
        suggested_taxonomy_node_id="leaf-arroz",
        suggested_category_name="Arroz, Granos & Legumbres",
        candidates=[],
    )

    dto = AdminReviewDetailDto.from_detail(detail)

    assert dto.market_id == "DO"
    assert dto.suggested_taxonomy_node_id == "leaf-arroz"
    assert dto.suggested_category_name == "Arroz, Granos & Legumbres"
