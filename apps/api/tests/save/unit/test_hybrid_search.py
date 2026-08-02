"""Unit — búsqueda híbrida del usuario (§6): trgm + pgvector fusionados por RRF. Sin DB, sin LLM.

Distinta del matching de ingesta aunque comparta la técnica (§6.4): acá la pregunta es «¿qué quiso
decir el usuario?» y un resultado de más no hace daño; en matching la pregunta es «¿este producto
ES este canónico?» y el error caro es el falso merge. Comparten RRF; NO comparten umbrales.
"""
from __future__ import annotations

import pytest

from src.contexts.save.application.search import SearchProducts
from src.contexts.save.domain.entities import CanonicalProduct, MatchCandidate


def _product(pid: str, name: str = "Producto", brand: str = "Marca") -> CanonicalProduct:
    return CanonicalProduct(
        id=pid,
        name=name,
        brand=brand,
        quantity=None,
        taxonomy_node_id="nodo",
        market_id="DO",
        slug=f"slug-{pid}",
    )


class _FakeRepo:
    """Repo fake del puerto: devuelve lo que se le programe por etapa."""

    def __init__(
        self,
        *,
        lexical: list[MatchCandidate] | None = None,
        semantic: list[MatchCandidate] | None = None,
        catalog: dict[str, CanonicalProduct] | None = None,
    ) -> None:
        self._lexical = lexical or []
        self._semantic = semantic or []
        self._catalog = catalog or {}
        self.lexical_calls: list[tuple[str, str]] = []
        self.semantic_calls: list[list[float]] = []

    def search_lexical(self, query: str, market_id: str, limit: int = 20):  # type: ignore[no-untyped-def]
        self.lexical_calls.append((query, market_id))
        return self._lexical[:limit]

    def search_semantic(self, embedding: list[float], market_id: str, limit: int = 20):  # type: ignore[no-untyped-def]
        self.semantic_calls.append(embedding)
        return self._semantic[:limit]

    def get_many(self, product_ids, market_id: str):  # type: ignore[no-untyped-def]
        return [self._catalog[pid] for pid in product_ids if pid in self._catalog]


class _FakeEmbedder:
    def __init__(self, vector: list[float] | None = None) -> None:
        self._vector = vector or [0.1, 0.2, 0.3]
        self.calls: list[list[str]] = []

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(texts)
        return [self._vector for _ in texts]


class _ExplodingEmbedder:
    def embed(self, texts: list[str]) -> list[list[float]]:
        raise RuntimeError("el endpoint BGE-M3 no responde")


class TestHybridFusion:
    def test_a_product_found_by_both_stages_outranks_one_found_by_only_one(self) -> None:
        """El consenso entre etapas es la señal: aparecer en las dos vale más que ganar en una."""
        repo = _FakeRepo(
            lexical=[MatchCandidate("solo-lexico", 0.9), MatchCandidate("ambas", 0.4)],
            semantic=[MatchCandidate("ambas", 0.8)],
            catalog={
                "solo-lexico": _product("solo-lexico", "Arroz Campos"),
                "ambas": _product("ambas", "Arroz Selecto"),
            },
        )

        results = SearchProducts(repo, embedding_provider=_FakeEmbedder()).execute("arroz", "DO")

        assert [r.id for r in results] == ["ambas", "solo-lexico"]

    def test_results_follow_the_fused_order_not_the_repos(self) -> None:
        """`get_many` no promete orden; el orden lo impone la fusión, no la DB."""
        repo = _FakeRepo(
            lexical=[MatchCandidate("b", 0.9), MatchCandidate("a", 0.5)],
            semantic=[],
            catalog={"a": _product("a"), "b": _product("b")},
        )
        repo.get_many = lambda ids, market_id: [_product("a"), _product("b")]  # type: ignore[method-assign]

        results = SearchProducts(repo).execute("algo", "DO")

        assert [r.id for r in results] == ["b", "a"]

    def test_caps_the_result_set(self) -> None:
        ids = [f"p{i}" for i in range(12)]
        repo = _FakeRepo(
            lexical=[MatchCandidate(i, 0.5) for i in ids],
            catalog={i: _product(i) for i in ids},
        )

        results = SearchProducts(repo, limit=5).execute("arroz", "DO")

        assert len(results) == 5

    def test_a_candidate_that_no_longer_exists_is_skipped_not_crashed(self) -> None:
        """Archivado entre la query de candidatos y la hidratación → se omite, no revienta."""
        repo = _FakeRepo(
            lexical=[MatchCandidate("fantasma", 0.9), MatchCandidate("vivo", 0.5)],
            catalog={"vivo": _product("vivo")},
        )

        results = SearchProducts(repo).execute("arroz", "DO")

        assert [r.id for r in results] == ["vivo"]

    @pytest.mark.parametrize("query", ["", "   "])
    def test_a_blank_query_returns_nothing_without_touching_the_repo(self, query: str) -> None:
        repo = _FakeRepo(lexical=[MatchCandidate("x", 1.0)], catalog={"x": _product("x")})

        assert SearchProducts(repo).execute(query, "DO") == []
        assert repo.lexical_calls == []


class TestDegradation:
    """§6.5 — sin embedder la búsqueda EMPEORA, pero NO se rompe ni inventa vecinos."""

    def test_without_an_embedder_the_semantic_stage_is_skipped_entirely(self) -> None:
        repo = _FakeRepo(
            lexical=[MatchCandidate("a", 0.7)],
            semantic=[MatchCandidate("no-deberia-salir", 0.9)],
            catalog={"a": _product("a"), "no-deberia-salir": _product("no-deberia-salir")},
        )

        results = SearchProducts(repo, embedding_provider=None).execute("arroz", "DO")

        assert [r.id for r in results] == ["a"]
        assert repo.semantic_calls == []  # jamás se alimenta un vector inventado

    def test_an_embedder_that_fails_degrades_to_lexical_instead_of_500(self) -> None:
        repo = _FakeRepo(
            lexical=[MatchCandidate("a", 0.7)], catalog={"a": _product("a")}
        )

        results = SearchProducts(repo, embedding_provider=_ExplodingEmbedder()).execute(
            "arroz", "DO"
        )

        assert [r.id for r in results] == ["a"]

    def test_the_embedder_receives_the_raw_user_query(self) -> None:
        embedder = _FakeEmbedder()
        repo = _FakeRepo(lexical=[], semantic=[], catalog={})

        SearchProducts(repo, embedding_provider=embedder).execute("aceite de oliva", "DO")

        assert embedder.calls == [["aceite de oliva"]]
