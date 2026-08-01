"""Unit — "Clasificar marcas" en lote, en las dos consolas.

Espeja `BulkClassifyReview` en lo estructural (SAVEPOINT por fila, éxito parcial explícito) y le
cambia lo que resuelve: la MARCA en vez de la categoría. Reconoce, nunca inventa — sólo acepta
marcas que ya existen en el catálogo (`domain/brand_from_name`).

El resumen tiene CUATRO estados, no tres. El cuarto ("ya tenía marca") no es cosmético: sin él,
seleccionar 20 filas de las que 15 ya estaban resueltas se leería como "5 resueltas, 15 sin
reconocer" — un lote exitoso disfrazado de fracaso.
"""
from __future__ import annotations

from src.contexts.save.application.bulk_resolve_brands import (
    BulkResolveCanonicalBrands,
    BulkResolveMatchBrands,
)
from src.contexts.save.domain.classification import ClassifiableProduct


class _FakeScope:
    """SAVEPOINT falso — verifica que cada fila corre en su propio ámbito."""

    def __init__(self) -> None:
        self.opened = 0

    def begin_nested(self):  # type: ignore[no-untyped-def]
        self.opened += 1
        return self

    def __enter__(self):  # type: ignore[no-untyped-def]
        return self

    def __exit__(self, *_):  # type: ignore[no-untyped-def]
        return False


class _FakeResolver:
    """`ResolveBrand` de mentira: reconoce las marcas guionadas dentro del nombre."""

    def __init__(self, known: list[str]) -> None:
        self._known = known

    def execute(self, product_name: str, market_id: str) -> str | None:
        upper = (product_name or "").upper()
        for brand in self._known:
            if brand.upper() in upper:
                return brand
        return None


# ------------------------------------------------------------------- cola de revisión --


class _FakeProducts:
    def __init__(self, mapping: dict[str, ClassifiableProduct]) -> None:
        self._mapping = mapping

    def classifiable_for_matches(self, match_ids):  # type: ignore[no-untyped-def]
        return [(m, self._mapping[m]) for m in match_ids if m in self._mapping]


class _FakeStoreRepo:
    def __init__(self, explode_on: str | None = None) -> None:
        self.written: dict[str, str] = {}
        self._explode_on = explode_on

    def set_brand(self, store_product_id: str, brand: str) -> None:
        if store_product_id == self._explode_on:
            raise RuntimeError("la base dijo que no")
        self.written[store_product_id] = brand


def _product(ref: str, name: str, brand: str = "") -> ClassifiableProduct:
    return ClassifiableProduct(ref_id=ref, is_canonical=False, name=name, brand=brand)


def _match_use_case(mapping, known, scope=None, store_repo=None):  # type: ignore[no-untyped-def]
    return BulkResolveMatchBrands(
        scope=scope or _FakeScope(),
        products=_FakeProducts(mapping),
        store_repo=store_repo or _FakeStoreRepo(),
        resolver=_FakeResolver(known),
        market_id="DO",
    )


class TestColaDeRevision:
    def test_rellena_las_que_tienen_marca_conocida_y_deja_las_otras_sin_decidir(self) -> None:
        store_repo = _FakeStoreRepo()
        use_case = _match_use_case(
            {
                "m1": _product("sp1", "LA GARZA ARROZ 10 LB"),
                "m2": _product("sp2", "ARROZ SELECTO 10 LB"),
            },
            ["LA GARZA"],
            store_repo=store_repo,
        )

        result = use_case.execute(["m1", "m2"])

        assert result.resolved == 1
        assert result.unresolved == 1
        assert store_repo.written == {"sp1": "LA GARZA"}  # la otra NO se escribió

    def test_una_fila_que_YA_tenia_marca_no_se_toca_y_se_reporta_aparte(self) -> None:
        store_repo = _FakeStoreRepo()
        use_case = _match_use_case(
            {"m1": _product("sp1", "LA GARZA ARROZ 10 LB", brand="Otra Marca")},
            ["LA GARZA"],
            store_repo=store_repo,
        )

        result = use_case.execute(["m1"])

        assert result.skipped == ["m1"]
        assert result.resolved == 0
        assert store_repo.written == {}  # nunca se pisa una marca existente

    def test_un_match_que_ya_no_existe_se_reporta_en_vez_de_desaparecer(self) -> None:
        result = _match_use_case({"m1": _product("sp1", "LA GARZA ARROZ")}, ["LA GARZA"]).execute(
            ["m1", "fantasma"]
        )

        assert result.resolved == 1
        assert [f.ref_id for f in result.failed] == ["fantasma"]

    def test_cada_fila_corre_en_su_propio_savepoint(self) -> None:
        scope = _FakeScope()
        _match_use_case(
            {"m1": _product("sp1", "LA GARZA ARROZ"), "m2": _product("sp2", "BRAVO ARROZ")},
            ["LA GARZA", "BRAVO"],
            scope=scope,
        ).execute(["m1", "m2"])

        assert scope.opened == 2

    def test_una_fila_que_explota_no_detiene_el_lote(self) -> None:
        store_repo = _FakeStoreRepo(explode_on="sp1")
        result = _match_use_case(
            {"m1": _product("sp1", "LA GARZA ARROZ"), "m2": _product("sp2", "BRAVO ARROZ")},
            ["LA GARZA", "BRAVO"],
            store_repo=store_repo,
        ).execute(["m1", "m2"])

        assert [f.ref_id for f in result.failed] == ["m1"]
        assert result.resolved == 1
        assert store_repo.written == {"sp2": "BRAVO"}


# ----------------------------------------------------------------- productos canónicos --


class _FakeCatalog:
    """Nombre de cada canónico + su marca actual."""

    def __init__(self, rows: dict[str, tuple[str, str | None]]) -> None:
        self._rows = rows

    def name_and_brand_of(self, canonical_product_id: str):  # type: ignore[no-untyped-def]
        return self._rows.get(canonical_product_id)


class _FakeProviderBrands:
    def __init__(self, mapping: dict[str, list[str]]) -> None:
        self._mapping = mapping
        self.calls = 0

    def brands_by_canonical(self, canonical_ids):  # type: ignore[no-untyped-def]
        self.calls += 1
        return {cid: self._mapping.get(cid, []) for cid in canonical_ids}


class _FakeCanonicalWriter:
    def __init__(self) -> None:
        self.written: dict[str, str] = {}

    def set_brand(self, canonical_product_id: str, brand: str) -> None:
        self.written[canonical_product_id] = brand


def _canonical_use_case(rows, provider_brands, known, writer=None, scope=None):  # type: ignore[no-untyped-def]
    return BulkResolveCanonicalBrands(
        scope=scope or _FakeScope(),
        catalog=_FakeCatalog(rows),
        provider_brands=_FakeProviderBrands(provider_brands),
        writer=writer or _FakeCanonicalWriter(),
        resolver=_FakeResolver(known),
        market_id="DO",
    )


class TestCanonicosPrecedenciaProveedorSobreNombre:
    def test_hereda_la_marca_OBSERVADA_del_proveedor_aunque_el_nombre_no_la_tenga(self) -> None:
        writer = _FakeCanonicalWriter()
        result = _canonical_use_case(
            {"c1": ("Res Molida Super Selecta", None)},
            {"c1": ["BRAVO"]},
            known=[],  # el nombre no contiene ninguna marca conocida
            writer=writer,
        ).execute(["c1"])

        assert writer.written == {"c1": "BRAVO"}
        assert result.rows[0].source == "provider"

    def test_si_ningun_proveedor_la_tiene_la_deduce_del_nombre(self) -> None:
        writer = _FakeCanonicalWriter()
        result = _canonical_use_case(
            {"c1": ("Arroz Enriquecido La Garza 5 Lb", None)},
            {"c1": []},
            known=["LA GARZA"],
            writer=writer,
        ).execute(["c1"])

        assert writer.written == {"c1": "LA GARZA"}
        assert result.rows[0].source == "name"

    def test_proveedores_que_discrepan_resuelven_a_la_mas_FRECUENTE(self) -> None:
        writer = _FakeCanonicalWriter()
        _canonical_use_case(
            {"c1": ("Habichuela Pinta", None)},
            {"c1": ["GOYA", "LA FAMOSA", "GOYA"]},
            known=[],
            writer=writer,
        ).execute(["c1"])

        assert writer.written == {"c1": "GOYA"}

    def test_el_desempate_es_DETERMINISTA_no_depende_del_orden(self) -> None:
        """Dos corridas sobre los mismos datos tienen que dar la misma marca."""
        def _run(brands: list[str]) -> dict[str, str]:
            writer = _FakeCanonicalWriter()
            _canonical_use_case(
                {"c1": ("Habichuela Pinta", None)}, {"c1": brands}, known=[], writer=writer
            ).execute(["c1"])
            return writer.written

        assert _run(["LA FAMOSA", "GOYA"]) == _run(["GOYA", "LA FAMOSA"])

    def test_un_canonico_que_YA_tiene_marca_no_se_toca(self) -> None:
        writer = _FakeCanonicalWriter()
        result = _canonical_use_case(
            {"c1": ("Arroz La Garza", "Marca Puesta A Mano")},
            {"c1": ["BRAVO"]},
            known=["LA GARZA"],
            writer=writer,
        ).execute(["c1"])

        assert writer.written == {}
        assert result.skipped == ["c1"]

    def test_las_marcas_de_los_proveedores_se_leen_en_UNA_query_para_todo_el_lote(self) -> None:
        provider_brands = _FakeProviderBrands({"c1": ["GOYA"], "c2": ["BRAVO"]})
        BulkResolveCanonicalBrands(
            scope=_FakeScope(),
            catalog=_FakeCatalog({"c1": ("A", None), "c2": ("B", None)}),
            provider_brands=provider_brands,
            writer=_FakeCanonicalWriter(),
            resolver=_FakeResolver([]),
            market_id="DO",
        ).execute(["c1", "c2"])

        assert provider_brands.calls == 1  # una query, no una por canónico

    def test_un_canonico_inexistente_se_reporta_en_failed(self) -> None:
        result = _canonical_use_case({"c1": ("Arroz", None)}, {}, known=[]).execute(
            ["c1", "fantasma"]
        )

        assert [f.ref_id for f in result.failed] == ["fantasma"]
