"""Unit — mapeo de los DTOs del detalle de revisión (rediseño full-stack). PURO, sin DB.

Verifica que `AdminReviewDetailDto.from_detail` y `AdminReviewCandidateDto.from_view` exponen los
campos nuevos del rediseño (SKU/EAN/tienda origen del store_product; imagen/tamaño del candidato).
"""
from __future__ import annotations

from src.contexts.save.application.dtos import (
    AdminReviewCandidateDto,
    AdminReviewDetailDto,
)
from src.contexts.save.domain.review_queue import ReviewCandidateView, ReviewDetail


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
