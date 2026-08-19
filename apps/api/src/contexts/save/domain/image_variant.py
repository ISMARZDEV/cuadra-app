"""Pedirle al CDN la foto DEL TAMAÑO QUE SE VA A VER. PURO (ADR 31).

⚠️ NO ES UN AHORRO DE ANCHO DE BANDA, ES DE RAM, y de un orden de magnitud.

En iOS, el `Image` de React Native decodifica a la RESOLUCIÓN NATIVA del archivo, mire lo que mire
la vista. Medido en este catálogo: las fotos vienen a **1000×1000**, o sea 1000 × 1000 × 4 =
**4 MB por foto en memoria**, y la tarjeta las dibuja a 110pt (330px en la pantalla más densa).
Se estaban decodificando ~11× los píxeles visibles.

Y se pagó de verdad: en el aparato del usuario la RAM subía hasta **1.2 GB** mientras el hilo de JS
caía a **21 fps** de tanto recolectar basura. La animación del buscador se veía a tirones no por
estar mal afinada, sino porque el JS no llegaba.

Es la MISMA lección que los PNG de categoría (435px para un círculo de 60pt): no se puede enseñar
más resolución de la que cabe, y la que no cabe se paga igual.

⚠️ POR QUÉ VIVE AQUÍ Y NO EN EL CLIENTE. La forma de la URL es conocimiento del PROVEEDOR, y el API
es quien sabe de qué proveedor salió cada foto. Puesto en la app, la web seguiría cargando los
originales y cada cliente nuevo tendría que reimplementarlo. Puesto aquí, se arregla una vez.

⚠️ POR QUÉ EN `domain` Y NO EN `infrastructure`. Es una política PURA de texto —ni red ni base de
datos—, igual que `slug.py` o `brand_from_name.py`. Y `application` no puede importar de
`infrastructure` sin invertir la dependencia.
"""
from __future__ import annotations

import re

#: A qué resolución se sirven las fotos de las TARJETAS.
#:
#: La placa de la tarjeta mide 110pt; en una pantalla @3x eso son 330px, el máximo que se puede
#: llegar a enseñar. 400 deja margen para una tarjeta algo mayor sin acercarse a los 1000×1000 del
#: original. Decodificado: 0.64 MB por foto en vez de 4 — **seis veces menos**, sin pérdida visible.
CARD_IMAGE_PX = 400

#: El patrón de VTEX: `/arquivos/ids/{id}` acepta `/arquivos/ids/{id}-{ancho}-{alto}`.
#:
#: El `id` puede traer YA un tamaño (`174504-1000-1000`), así que el sufijo se captura aparte para
#: SUSTITUIRLO en vez de encadenar otro — encadenados, el CDN devuelve 404 y la tarjeta se queda
#: sin foto, que es peor que la foto pesada.
_VTEX_IDS = re.compile(r"(/arquivos/ids/)(\d+)(?:-\d+-\d+)?(/)")


def sized_image_url(url: str | None, px: int = CARD_IMAGE_PX) -> str | None:
    """La misma URL pidiendo `px`×`px`, si el proveedor sabe redimensionar.

    Si NO lo sabe, devuelve la original SIN TOCAR. Save ingiere de varias cadenas y sólo algunas
    usan VTEX: inventarle un sufijo a otra rompería la foto en vez de encogerla.
    """
    if not url:
        return url
    return _VTEX_IDS.sub(rf"\g<1>\g<2>-{px}-{px}\g<3>", url, count=1)
