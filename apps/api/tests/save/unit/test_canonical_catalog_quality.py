"""Unit — derivación PURA de calidad/completitud del catálogo canónico (F5, US-CP-L3/L9).

Por qué vive en `domain` y se prueba acá: los badges que el operador usa para PRIORIZAR trabajo
no pueden depender de la DB ni de un LLM. Son reglas sobre campos, y una regla se prueba sin
levantar nada. Mismo precedente que `derive_source_health` (Batch 3E).
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from src.contexts.save.domain.canonical_catalog import (
    PRICE_STALENESS_THRESHOLD,
    CanonicalQualityStatus,
    derive_completeness_score,
    derive_quality_statuses,
)

NOW = datetime(2026, 7, 25, 12, 0, tzinfo=UTC)


def _statuses(**overrides):  # type: ignore[no-untyped-def]
    """Un canónico COMPLETO por defecto; cada test rompe sólo la señal que le interesa."""
    kwargs = {
        "image_url": "https://cdn/x.jpg",
        "category": "Arroz",
        "matched_provider_count": 3,
        "quality": "standard",
        "last_price_seen_at": NOW - timedelta(hours=2),
        "possible_duplicate_count": 0,
        "now": NOW,
    }
    kwargs.update(overrides)
    return derive_quality_statuses(**kwargs)  # type: ignore[arg-type]


class TestDeriveQualityStatuses:
    def test_a_canonical_with_no_gaps_is_complete(self) -> None:
        assert _statuses() == [CanonicalQualityStatus.COMPLETE]

    def test_complete_is_never_mixed_with_a_gap(self) -> None:
        """`complete` es EXCLUYENTE: decir "completo, sin imagen" sería una contradicción en la UI."""
        result = _statuses(image_url=None)
        assert CanonicalQualityStatus.COMPLETE not in result

    def test_missing_image_is_reported(self) -> None:
        assert CanonicalQualityStatus.NO_IMAGE in _statuses(image_url=None)

    def test_empty_string_image_counts_as_missing(self) -> None:
        assert CanonicalQualityStatus.NO_IMAGE in _statuses(image_url="")

    def test_missing_category_is_reported(self) -> None:
        assert CanonicalQualityStatus.NO_CATEGORY in _statuses(category=None)

    def test_missing_quality_is_reported(self) -> None:
        assert CanonicalQualityStatus.NO_QUALITY in _statuses(quality=None)

    def test_zero_providers_is_reported(self) -> None:
        assert CanonicalQualityStatus.NO_PROVIDERS in _statuses(matched_provider_count=0)


class TestStalePrice:
    """`stale_price` es la señal de que NINGUNA corrida tocó este canónico en el umbral."""

    def test_a_price_older_than_the_threshold_is_stale(self) -> None:
        old = NOW - PRICE_STALENESS_THRESHOLD - timedelta(hours=1)
        assert CanonicalQualityStatus.STALE_PRICE in _statuses(last_price_seen_at=old)

    def test_a_fresh_price_is_not_stale(self) -> None:
        assert _statuses() == [CanonicalQualityStatus.COMPLETE]

    def test_stale_is_not_reported_when_there_are_no_providers(self) -> None:
        """Sin proveedores no hay precio que pueda estar viejo: `no_providers` ya lo dice todo.
        Apilar `stale_price` encima sería ruido que no cambia qué tiene que hacer el operador."""
        result = _statuses(matched_provider_count=0, last_price_seen_at=None)
        assert CanonicalQualityStatus.STALE_PRICE not in result
        assert CanonicalQualityStatus.NO_PROVIDERS in result


class TestPossibleDuplicate:
    def test_a_canonical_with_a_duplicate_signal_is_flagged(self) -> None:
        assert CanonicalQualityStatus.POSSIBLE_DUPLICATE in _statuses(possible_duplicate_count=1)

    def test_a_duplicate_prevents_complete_even_with_every_field_filled(self) -> None:
        """Un canónico duplicado NO está sano aunque tenga todos los campos: contamina las
        comparaciones, que es el peor caso de Save. Tiene que salir en la lista de trabajo."""
        result = _statuses(possible_duplicate_count=2)
        assert result == [CanonicalQualityStatus.POSSIBLE_DUPLICATE]


class TestDeriveCompletenessScore:
    def test_every_field_present_is_100(self) -> None:
        score = derive_completeness_score(
            image_url="https://cdn/x.jpg",
            category="Arroz",
            matched_provider_count=2,
            brand="GOYA",
            display_size="10 Lb",
            quality="standard",
        )
        assert score == 100

    def test_nothing_present_is_zero(self) -> None:
        score = derive_completeness_score(
            image_url=None,
            category=None,
            matched_provider_count=0,
            brand="",
            display_size=None,
            quality=None,
        )
        assert score == 0

    def test_half_the_fields_is_fifty(self) -> None:
        score = derive_completeness_score(
            image_url="https://cdn/x.jpg",
            category="Arroz",
            matched_provider_count=1,
            brand="",
            display_size=None,
            quality=None,
        )
        assert score == 50

    def test_a_possible_duplicate_does_not_lower_the_score(self) -> None:
        """El score mide CAMPOS COMPLETOS, no salud global. Un duplicado se comunica por badge —
        mezclarlo en el porcentaje haría que "completitud" dejara de significar lo que dice."""
        full = derive_completeness_score(
            image_url="https://cdn/x.jpg",
            category="Arroz",
            matched_provider_count=2,
            brand="GOYA",
            display_size="10 Lb",
            quality="standard",
        )
        assert full == 100
