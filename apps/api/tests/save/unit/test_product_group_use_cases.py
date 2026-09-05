"""Casos de uso de los grupos de productos, con repos FALSOS (sin DB).

Lo que se prueba aquí es la DECISIÓN, no el SQL: de quién es cada grupo, qué nombre se acepta y qué
pasa cuando el usuario intenta lo mismo dos veces.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from src.contexts.save.application.errors import (
    CanonicalProductNotFoundError,
    DuplicateGroupNameError,
    ProductGroupNotFoundError,
    TooManyGroupsError,
)
from src.contexts.save.application.groups import (
    AddProductToGroup,
    CreateProductGroup,
    DeleteProductGroup,
    ListProductGroups,
    RemoveProductFromGroup,
)
from src.contexts.save.domain.groups import MAX_GROUPS_PER_USER, ProductGroup

YO = "user-1"
OTRO = "user-2"
PRODUCTO = "canon-1"


class FakeGroupRepo:
    def __init__(self) -> None:
        self.groups: dict[str, dict] = {}
        self.items: set[tuple[str, str]] = set()
        self._n = 0

    def create(self, user_id: str, name: str, market_id: str) -> str:
        self._n += 1
        gid = f"g{self._n}"
        self.groups[gid] = {
            "user_id": user_id,
            "name": name,
            "market_id": market_id,
            "created_at": datetime.now(timezone.utc),
        }
        return gid

    def list_by_user(self, user_id: str) -> list[ProductGroup]:
        return [
            ProductGroup(
                id=gid,
                name=g["name"],
                product_count=sum(1 for (x, _) in self.items if x == gid),
                created_at=g["created_at"],
            )
            for gid, g in self.groups.items()
            if g["user_id"] == user_id
        ]

    def delete(self, user_id: str, group_id: str) -> bool:
        if self.groups.get(group_id, {}).get("user_id") != user_id:
            return False
        del self.groups[group_id]
        self.items = {(g, p) for (g, p) in self.items if g != group_id}
        return True

    def add_product(self, user_id: str, group_id: str, canonical_product_id: str) -> bool:
        if self.groups.get(group_id, {}).get("user_id") != user_id:
            return False
        self.items.add((group_id, canonical_product_id))
        return True

    def remove_product(self, user_id: str, group_id: str, canonical_product_id: str) -> bool:
        if self.groups.get(group_id, {}).get("user_id") != user_id:
            return False
        self.items.discard((group_id, canonical_product_id))
        return True

    def group_ids_with_product(self, user_id: str, canonical_product_id: str) -> set[str]:
        return {
            g
            for (g, p) in self.items
            if p == canonical_product_id and self.groups.get(g, {}).get("user_id") == user_id
        }


class FakeCanonicalRepo:
    """Sólo sabe si un producto existe. Es todo lo que los grupos necesitan de él."""

    def __init__(self, existen: set[str]) -> None:
        self._existen = existen

    def get_by_id(self, product_id: str):
        return object() if product_id in self._existen else None


@pytest.fixture
def repo() -> FakeGroupRepo:
    return FakeGroupRepo()


@pytest.fixture
def canónicos() -> FakeCanonicalRepo:
    return FakeCanonicalRepo({PRODUCTO, "canon-2"})


class TestListar:
    def test_sólo_devuelve_los_grupos_DEL_USUARIO(self, repo: FakeGroupRepo) -> None:
        repo.create(YO, "Fiesta", "DO")
        repo.create(OTRO, "Suyo", "DO")

        grupos = ListProductGroups(repo).execute(YO)

        assert [g.name for g in grupos] == ["Fiesta"]

    def test_dice_en_CUÁLES_está_el_producto(self, repo: FakeGroupRepo) -> None:
        # Es el dato que la hoja necesita para pintar la palomita. Sin él, el usuario tendría que
        # recordar dónde metió cada cosa.
        con = repo.create(YO, "Con", "DO")
        repo.create(YO, "Sin", "DO")
        repo.add_product(YO, con, PRODUCTO)

        grupos = {g.name: g.contains for g in ListProductGroups(repo).execute(YO, PRODUCTO)}

        assert grupos == {"Con": True, "Sin": False}

    def test_sin_producto_no_hay_pertenencia_que_marcar(self, repo: FakeGroupRepo) -> None:
        g = repo.create(YO, "Fiesta", "DO")
        repo.add_product(YO, g, PRODUCTO)

        grupos = ListProductGroups(repo).execute(YO)

        assert [g.contains for g in grupos] == [False]

    def test_lleva_CUÁNTOS_productos_tiene_cada_uno(self, repo: FakeGroupRepo) -> None:
        g = repo.create(YO, "Fiesta", "DO")
        repo.add_product(YO, g, PRODUCTO)
        repo.add_product(YO, g, "canon-2")

        assert ListProductGroups(repo).execute(YO)[0].product_count == 2


class TestCrear:
    def test_limpia_el_nombre_antes_de_guardarlo(
        self, repo: FakeGroupRepo, canónicos: FakeCanonicalRepo
    ) -> None:
        dto = CreateProductGroup(repo, canónicos).execute(YO, "  Canasta   del  mes ", "DO")

        assert dto.name == "Canasta del mes"

    def test_un_nombre_en_blanco_no_crea_nada(
        self, repo: FakeGroupRepo, canónicos: FakeCanonicalRepo
    ) -> None:
        with pytest.raises(ValueError):
            CreateProductGroup(repo, canónicos).execute(YO, "   ", "DO")
        assert repo.groups == {}

    def test_el_mismo_nombre_en_otra_caja_es_el_MISMO_grupo(
        self, repo: FakeGroupRepo, canónicos: FakeCanonicalRepo
    ) -> None:
        # Dejar pasar «Fiesta» y «fiesta» le deja al usuario dos filas idénticas en la hoja y ninguna
        # forma de saber cuál es cuál.
        crear = CreateProductGroup(repo, canónicos)
        crear.execute(YO, "Fiesta", "DO")

        with pytest.raises(DuplicateGroupNameError):
            crear.execute(YO, "  FIESTA ", "DO")

    def test_el_grupo_de_OTRO_usuario_no_estorba(
        self, repo: FakeGroupRepo, canónicos: FakeCanonicalRepo
    ) -> None:
        repo.create(OTRO, "Fiesta", "DO")

        dto = CreateProductGroup(repo, canónicos).execute(YO, "Fiesta", "DO")

        assert dto.name == "Fiesta"

    def test_hay_un_techo(self, repo: FakeGroupRepo, canónicos: FakeCanonicalRepo) -> None:
        for i in range(MAX_GROUPS_PER_USER):
            repo.create(YO, f"Grupo {i}", "DO")

        with pytest.raises(TooManyGroupsError):
            CreateProductGroup(repo, canónicos).execute(YO, "Uno más", "DO")

    def test_crear_Y_meter_el_producto_es_UN_solo_gesto(
        self, repo: FakeGroupRepo, canónicos: FakeCanonicalRepo
    ) -> None:
        # En la hoja, «crear grupo» se toca teniendo un producto delante. Separarlo en dos llamadas
        # abre una ventana en la que el grupo existe vacío: si la segunda falla, el usuario se queda
        # con una carpeta que no pidió.
        dto = CreateProductGroup(repo, canónicos).execute(YO, "Fiesta", "DO", product_id=PRODUCTO)

        assert dto.contains is True
        assert dto.product_count == 1

    def test_con_un_producto_que_no_existe_no_crea_el_grupo(
        self, repo: FakeGroupRepo, canónicos: FakeCanonicalRepo
    ) -> None:
        with pytest.raises(CanonicalProductNotFoundError):
            CreateProductGroup(repo, canónicos).execute(YO, "Fiesta", "DO", product_id="fantasma")

        assert repo.groups == {}


class TestPertenencia:
    def test_añadir_es_IDEMPOTENTE(self, repo: FakeGroupRepo, canónicos: FakeCanonicalRepo) -> None:
        # Dos toques seguidos en la hoja no pueden dar error: el segundo describe el mismo mundo que
        # el primero.
        g = repo.create(YO, "Fiesta", "DO")
        añadir = AddProductToGroup(repo, canónicos)

        añadir.execute(YO, g, PRODUCTO)
        añadir.execute(YO, g, PRODUCTO)

        assert ListProductGroups(repo).execute(YO)[0].product_count == 1

    def test_no_se_puede_añadir_al_grupo_de_OTRO(
        self, repo: FakeGroupRepo, canónicos: FakeCanonicalRepo
    ) -> None:
        # Sin esta guarda, conocer un id ajeno bastaría para escribir en la carpeta de otro (IDOR).
        ajeno = repo.create(OTRO, "Suyo", "DO")

        with pytest.raises(ProductGroupNotFoundError):
            AddProductToGroup(repo, canónicos).execute(YO, ajeno, PRODUCTO)

    def test_un_producto_que_no_existe_no_entra(
        self, repo: FakeGroupRepo, canónicos: FakeCanonicalRepo
    ) -> None:
        g = repo.create(YO, "Fiesta", "DO")

        with pytest.raises(CanonicalProductNotFoundError):
            AddProductToGroup(repo, canónicos).execute(YO, g, "fantasma")

    def test_quitar_lo_que_no_está_no_es_un_error(self, repo: FakeGroupRepo) -> None:
        g = repo.create(YO, "Fiesta", "DO")

        RemoveProductFromGroup(repo).execute(YO, g, PRODUCTO)

        assert ListProductGroups(repo).execute(YO)[0].product_count == 0

    def test_no_se_puede_quitar_del_grupo_de_OTRO(self, repo: FakeGroupRepo) -> None:
        ajeno = repo.create(OTRO, "Suyo", "DO")

        with pytest.raises(ProductGroupNotFoundError):
            RemoveProductFromGroup(repo).execute(YO, ajeno, PRODUCTO)


class TestBorrar:
    def test_borra_el_propio(self, repo: FakeGroupRepo) -> None:
        g = repo.create(YO, "Fiesta", "DO")

        DeleteProductGroup(repo).execute(YO, g)

        assert ListProductGroups(repo).execute(YO) == []

    def test_no_borra_el_de_OTRO(self, repo: FakeGroupRepo) -> None:
        ajeno = repo.create(OTRO, "Suyo", "DO")

        with pytest.raises(ProductGroupNotFoundError):
            DeleteProductGroup(repo).execute(YO, ajeno)
