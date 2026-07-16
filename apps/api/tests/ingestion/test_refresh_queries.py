"""Unit — de dónde sale la canasta que se ingiere. PURO, sin DB ni red.

`select_queries` decide QUÉ queries se ingieren: las de la TABLA `basket_query` (active, ya
resueltas por el repo). La tabla es la ÚNICA fuente — ya NO hay fallback hardcodeado (el backfill
vive en migración y la tabla se protege de los resets). La perilla `SAVE_REFRESH_QUERY_LIMIT`
recorta a las primeras N (runs cortos en dev).

Vive en `composition.py` (NO en `assets.py`) porque es wiring COMPARTIDO: los assets de Dagster y el
CLI `seeds.save_refresh` deben leer la MISMA canasta. Mientras vivía en `assets.py` —que importa
dagster a nivel de módulo— el CLI no podía reusarlo, y por eso terminó llamando `build_sources()` a
secas, llevándose el tuple hardcodeado en silencio. **La ubicación del helper ERA el bug.**

Efecto lateral de la mudanza: este archivo ya no necesita `importorskip("dagster")`, así que CI —que
no sincroniza el dependency-group `ingestion`— pasa de SALTARSE estos tests a correrlos de verdad.
"""
from __future__ import annotations

from ingestion.save.composition import build_basket_queries, select_queries


def test_uses_table_queries() -> None:
    result = select_queries(["arroz la garza", "leche rica"], limit_env=None)
    assert result == ("arroz la garza", "leche rica")


def test_empty_table_returns_empty_no_hardcoded_fallback() -> None:
    # Ya no hay fallback: canasta vacía → nada que ingerir (el asset avisa con un warning).
    result = select_queries([], limit_env=None)
    assert result == ()


def test_limit_slices_table_queries() -> None:
    result = select_queries(["a", "b", "c", "d"], limit_env="2")
    assert result == ("a", "b")


def test_limit_on_empty_stays_empty() -> None:
    result = select_queries([], limit_env="3")
    assert result == ()


def test_invalid_limit_is_ignored() -> None:
    result = select_queries(["a", "b"], limit_env="cero")
    assert result == ("a", "b")


# ── Wiring: la canasta sale del REPO, y del MERCADO pedido ────────────────────────────────────


class _FakeQuery:
    def __init__(self, text: str) -> None:
        self.query_text = text


class _FakeBasketRepo:
    def __init__(self, session) -> None:  # type: ignore[no-untyped-def]
        self.session = session
        self.calls: list[str] = []

    def list_active(self, market: str) -> list[_FakeQuery]:
        self.calls.append(market)
        return [_FakeQuery("arroz la garza"), _FakeQuery("leche rica")]


def test_reads_the_active_basket_of_the_requested_market(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    # Multi-país: cada mercado ingiere SU canasta, nunca market-blind.
    import ingestion.save.composition as composition

    captured: dict = {}

    def _repo(session):  # type: ignore[no-untyped-def]
        captured["repo"] = _FakeBasketRepo(session)
        return captured["repo"]

    monkeypatch.setattr(composition, "SqlBasketQueryRepository", _repo)
    monkeypatch.delenv("SAVE_REFRESH_QUERY_LIMIT", raising=False)

    result = build_basket_queries("fake-session", "DO")

    assert result == ("arroz la garza", "leche rica")
    assert captured["repo"].calls == ["DO"]  # filtró por mercado, no trajo todo
