"""Unit — pedirle al CDN la foto DEL TAMAÑO QUE SE VA A VER (PURO, ADR 31).

No es un ahorro de ancho de banda: es de RAM, y de un orden de magnitud. Medido en el aparato del
usuario, la app llegó a **1.2 GB** con el hilo de JS hundido a 21 fps de tanto recolectar basura.
La causa: las fotos del catálogo vienen a 1000×1000 y iOS las decodifica a resolución NATIVA mire lo
que mire la vista — 1000 × 1000 × 4 = **4 MB por foto** — mientras la tarjeta las dibuja a 110pt.

Vive en `domain` y no en `infrastructure` porque es una política PURA de texto, igual que
`slug.py` o `brand_from_name.py`: no toca red ni base de datos. Y vive en el BACKEND y no en el
cliente porque la forma de la URL es conocimiento del PROVEEDOR, y el API es quien sabe de qué
proveedor salió cada foto — además así lo aprovechan la app Y la web, en vez de una sola.
"""
from __future__ import annotations

from src.contexts.save.domain.image_variant import CARD_IMAGE_PX, sized_image_url

VTEX = "https://gruporamos.vteximg.com.br/arquivos/ids/174504/1-und-760593023830.jpg"


def test_pide_la_foto_al_tamano_que_se_ve() -> None:
    assert sized_image_url(VTEX, 400) == (
        "https://gruporamos.vteximg.com.br/arquivos/ids/174504-400-400/1-und-760593023830.jpg"
    )


def test_conserva_la_query_que_lleva_la_version_del_archivo() -> None:
    # El `?v=` es el cache-buster del CDN: perderlo serviría una foto vieja tras un cambio.
    assert sized_image_url(f"{VTEX}?v=639150597014730000", 300) == (
        "https://gruporamos.vteximg.com.br/arquivos/ids/174504-300-300/"
        "1-und-760593023830.jpg?v=639150597014730000"
    )


def test_sustituye_un_tamano_ya_puesto_en_vez_de_encadenar_otro() -> None:
    # Encadenados (`174504-1000-1000-400-400`) el CDN devuelve 404 y la tarjeta se queda sin foto.
    ya = "https://gruporamos.vteximg.com.br/arquivos/ids/174504-1000-1000/1-und.jpg"
    assert sized_image_url(ya, 400) == (
        "https://gruporamos.vteximg.com.br/arquivos/ids/174504-400-400/1-und.jpg"
    )


def test_deja_intacta_una_url_de_un_proveedor_que_no_sabemos_redimensionar() -> None:
    # LA GARANTÍA QUE IMPORTA. Save ingiere de varias cadenas y sólo algunas usan VTEX: inventarle
    # un sufijo a otra ROMPERÍA la foto en vez de encogerla, y una tarjeta sin foto es peor que una
    # tarjeta con la foto pesada.
    otra = "https://cdn.otra-tienda.com/media/catalog/product/x/y/foto.jpg"
    assert sized_image_url(otra, 400) == otra


def test_tolera_ausencia_y_vacio() -> None:
    assert sized_image_url(None, 400) is None
    assert sized_image_url("", 400) == ""


def test_una_url_con_basura_no_revienta_el_listado() -> None:
    # Llega de un CDN de terceros: no se puede confiar en que siempre tenga la forma esperada.
    assert sized_image_url("no-es-una-url", 400) == "no-es-una-url"


def test_el_tamano_de_card_cubre_la_pantalla_mas_densa() -> None:
    # La placa mide 110pt y la pantalla más densa que existe es @3x → 330px. El valor por defecto
    # tiene que cubrirlo o las fotos se verían blandas; y no mucho más, o se vuelve a pagar RAM.
    assert 330 <= CARD_IMAGE_PX <= 512
