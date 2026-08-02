"""¿Merece cada token del léxico decidir una hoja solo? Medición PURA, sin DB.

El índice (`build_lexicon_index`) infería *único en la taxonomía ⇒ identifica la clase*. Es la
inferencia equivocada: `secos` es único en «Semillas & Frutos Secos» y sin embargo los productos
que lo llevan son guandules. La información que hace falta no está en los 133 nombres de hoja sino
en el CORPUS DE PRODUCTOS, y este módulo la extrae.

**La métrica es el LIFT, no P(raíz | token).** No es un matiz: con un corpus sesgado, P tiende al
prior de la clase mayoritaria. Medido el 2026-08-01 con el corpus al 84% de una sola raíz, `«lbs»`
—una unidad de medida— daba P=1.00 y encabezaba la lista de "identificadores". El lift lo descarta
solo, porque no levanta la probabilidad por encima de la tasa base.

    lift = P(raíz | token) / P(raíz)

    lift ≈ 1  → el token no aporta nada sobre el azar del corpus
    lift < 1  → ANTI-informativo (medido: `avena` 0.93)
    lift > 1  → informativo, y cuánto

ETIQUETA DÉBIL: la raíz de cada producto sale de su `source_category` — la estantería donde la
propia tienda lo puso. No es circular respecto del token, que sale del NOMBRE: son dos textos
distintos. Es supervisión débil gratis y a escala, sin trabajo humano de etiquetado.

REGLA DE SEGURIDAD — **la medición sólo puede QUITAR poder, nunca darlo**: un token se degrada con
evidencia en contra, y sin evidencia suficiente queda como está. Por eso `min_support`. Sin esa
regla, un corpus chico o sesgado degradaría medio léxico por ruido — y como el léxico alimenta la
etapa que más decide en producción, el remedio sería peor que la enfermedad.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass

from .lexicon import LexiconIndex, _tokens

# CONCENTRACIÓN mínima: qué fracción de los productos que llevan el token cae en UNA sola raíz.
#
# Es el criterio que separa un identificador de un modificador, y NO es lo mismo que exigir que la
# raíz del corpus coincida con la del índice. Medido 2026-08-01 sobre 2562 productos:
#
#   «detergente» 140 productos, ~100% en Limpieza  → CONCENTRA. Es buen token; lo que está mal es
#                que el índice lo mande a «Detergente De Bebé», la única hoja que lo nombra.
#                Eso es un HUECO DE TAXONOMÍA, no un token roto — degradarlo sería el arreglo
#                equivocado (y perdería 140 clasificaciones correctas de limpieza).
#   «polvo»       88 productos repartidos entre detergente en polvo y leche en polvo → NO concentra.
#   «congelado»   16 repartidos entre vegetales, pollo y mariscos → NO concentra.
#
# Los dos últimos son modificadores de forma/estado, la misma familia que `secos`. Un primer
# criterio basado en "la raíz del corpus difiere de la del índice" los mezclaba con `detergente`,
# porque ambos casos producen desacuerdo de raíz.
MIN_CONCENTRATION = 0.80
MIN_SUPPORT = 5


@dataclass(frozen=True, slots=True)
class LabeledProduct:
    """Un producto del corpus con su etiqueta DÉBIL (la raíz que dice la estantería de la tienda)."""

    name: str
    root_id: str


@dataclass(frozen=True, slots=True)
class TokenReliability:
    """El veredicto medido sobre un token, CON la evidencia que lo sostiene.

    Se guardan `support`, `probability` y `lift` además de `decides` porque un veredicto sin su
    evidencia no es revisable: un humano que vea "este token ya no decide" tiene que poder juzgar
    si la medición fue justa o si el corpus todavía era muy chico.
    """

    token: str
    taxonomy_node_id: str  # la hoja que el ÍNDICE le asigna
    index_root_id: str | None  # la raíz de esa hoja
    corpus_root_id: str | None  # la raíz donde el CORPUS dice que caen sus productos
    support: int
    probability: float  # concentración: fracción del corpus del token que cae en `corpus_root_id`
    lift: float
    decides: bool
    # El token CONCENTRA, pero en una raíz distinta de la que el índice le asigna. NO es un token
    # roto: es un hueco de la taxonomía o del vocabulario. `detergente` concentra al 100% en
    # Limpieza y el índice lo manda a «Detergente De Bebé» sólo porque es la única hoja que lo
    # nombra. La corrección es curar la taxonomía —no degradar el token—, así que esto se REPORTA
    # para revisión humana en vez de aplicarse solo.
    #
    # Es campo y no `property` porque depende del `min_support` con el que se midió, que el
    # llamador puede cambiar; una property tendría que leer la constante global y mentiría.
    mismapped: bool = False


def measure_token_reliability(
    corpus: list[LabeledProduct],
    index: LexiconIndex,
    root_of_leaf: dict[str, str],
    *,
    min_support: int = MIN_SUPPORT,
    min_concentration: float = MIN_CONCENTRATION,
) -> list[TokenReliability]:
    """Veredicto por cada token que HOY decide en `index`.

    Sólo mide los tokens del índice: la pregunta es si los que ya deciden merecen hacerlo. Promover
    tokens nuevos es una decisión distinta —y más riesgosa— que esta función no toma.
    """
    prior: Counter[str] = Counter(p.root_id for p in corpus)
    total = sum(prior.values())
    if total == 0:
        return []

    por_token: dict[str, Counter[str]] = defaultdict(Counter)
    for producto in corpus:
        for token in set(_tokens(producto.name)):
            if token in index:
                por_token[token][producto.root_id] += 1

    veredictos = []
    for token, hoja_id in index.items():
        conteo = por_token.get(token)
        raiz_indice = root_of_leaf.get(hoja_id)
        if not conteo:
            # El token no aparece en el corpus: no hay evidencia ni a favor ni en contra.
            veredictos.append(
                TokenReliability(token, hoja_id, raiz_indice, None, 0, 0.0, 0.0, decides=True)
            )
            continue

        soporte = sum(conteo.values())
        raiz_mayor, n_mayor = conteo.most_common(1)[0]
        concentracion = n_mayor / soporte
        base = prior[raiz_mayor] / total
        lift = concentracion / base if base else 0.0

        # Se degrada por NO CONCENTRAR, no por caer en otra raíz que la del índice. Un token que
        # concentra pero apunta a otra raíz sigue siendo un identificador — lo que está mal es el
        # mapeo, y eso se corrige curando la taxonomía (ver `mismapped`), no borrando el token.
        # Se degrada SOLO por lift < 1 — la única señal inequívoca, y la más conservadora posible.
        #
        # Se probaron dos criterios más ambiciosos contra el corpus real y los DOS rompieron más de
        # lo que arreglaron (el gate de simulación los frenó):
        #   · "la raíz del corpus difiere de la del índice" → 298 clasificaciones perdidas. Degrada
        #     `detergente` y `salchicha`, que están BIEN: sólo que la tienda usa otro pasillo que
        #     nuestro árbol.
        #   · "el token no concentra en una raíz" → 455 perdidas. Degrada `leche`, `pollo`, `queso`,
        #     `pan`: el vocabulario real es POLISÉMICO (leche de vaca / de coco / corporal) y aun
        #     así esos tokens sirven.
        #
        # Un lift < 1 no admite esa defensa: significa que el token hace MENOS probable su clase
        # que el azar del corpus. No hay lectura benigna de eso.
        #
        # Todo lo demás se REPORTA (`mismapped`, y las métricas de cada veredicto) para que una
        # persona lo revise. La etiqueta débil —la estantería de la tienda— no alcanza para decidir
        # sola; ver el módulo.
        con_evidencia = soporte >= min_support
        decides = not con_evidencia or lift >= 1.0

        veredictos.append(
            TokenReliability(
                token=token,
                taxonomy_node_id=hoja_id,
                index_root_id=raiz_indice,
                corpus_root_id=raiz_mayor,
                support=soporte,
                probability=concentracion,
                lift=lift,
                decides=decides,
                mismapped=con_evidencia and decides and raiz_mayor != raiz_indice,
            )
        )
    return veredictos


def demoted_tokens(veredictos: list[TokenReliability]) -> frozenset[str]:
    """Los tokens que la medición degradó — lo que `build_lexicon_index` necesita saber."""
    return frozenset(v.token for v in veredictos if not v.decides)
