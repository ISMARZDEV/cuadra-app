"""Etapa léxica determinista de la cascada de clasificación (save-category-classification, Batch 3).

Diccionario keyword→hoja derivado de los NOMBRES de subcategoría (auto, sin tabla). Alta precisión:
- Tokeniza cada nombre de subcategoría con `slugify` (normaliza acentos/caja) → tokens ≥3 chars,
  sin stopwords.
- Un token que mapea a >1 hoja es AMBIGUO → se descarta del índice (nunca asigna a ciegas).
- `lexicon_match` asigna solo si el nombre del producto pega tokens de UNA sola hoja; si no, `None`
  (deja que las etapas trgm/vector/juez decidan).

PURO: sin DB ni I/O. `build_lexicon_index` recibe las hojas ya cargadas (composición).
"""
from __future__ import annotations

from ...domain.category_suggestion import CategorySuggestion
from ...domain.taxonomy import slugify

LexiconIndex = dict[str, str]  # token -> taxonomy_node_id (hoja)

LEXICON_CONFIDENCE = 0.95  # match determinista de keyword = confianza alta (banda auto)

_MIN_TOKEN_LEN = 3
_STOPWORDS = frozenset({
    "los", "las", "del", "con", "por", "sin", "una", "uno", "que", "para", "the", "and",
})

# Tokens que aparecen en el nombre de UNA sola hoja pero NO la identifican: nombran un ATRIBUTO
# (estado, ausencia, destinatario) en vez de una CLASE de producto. Se excluyen del índice.
#
# Por qué hace falta además de `_STOPWORDS`: aquéllas son palabras función (preposiciones,
# artículos) que no significan nada en ningún contexto. Éstas SÍ significan — pero describen una
# propiedad, no una categoría, así que un producto puede llevarlas sin pertenecer a la hoja donde
# viven. El índice confundía ser ÚNICO en la taxonomía con ser IDENTIFICADOR.
#
# Medido 2026-08-01 sobre los 292 store_products de la corrida real:
#   · `secos`     decidió 6 productos, 6 MAL — «Semillas & Frutos Secos» para guandules SECOS.
#   · `semillas`  decidió 1 producto,  1 MAL — `Uvas Rojas SIN Semillas` (la AUSENCIA del atributo).
#   · `alimentos` resolvió el path `Mascotas > Perro > Alimentos para Perros` a «Alimentos Para
#     Bebé»; todo comestible es un alimento, así que solo no discrimina nada.
#
# El costo no era cosmético: sin clasificación un producto no puede canonizarse (bootstrap la
# exige) ni descartarlo R2 (su contrato exige clasificación CONFIADA), así que `Guandules Secos La
# Famosa 15 Oz` —legítimo de la canasta— quedaba atrapado en la cola sin salida automática.
#
# CRITERIO para sumar un token acá: ¿nombra la CLASE del producto, o una propiedad suya? `arroz`,
# `pan` y `galletas` nombran la clase y NO entran (miden 128, 1 y 1 aciertos respectivamente).
# Cada entrada debe tener un caso medido detrás — no agregar por intuición.
#
# Ojo: excluir TODOS los tokens de una hoja la volvería inalcanzable por léxico. `frutos` se deja a
# propósito, para que «Semillas & Frutos Secos» siga teniendo su token de clase.
_ATTRIBUTE_TOKENS = frozenset({
    "seco", "seca", "secos", "secas",
    "semilla", "semillas",
    "alimento", "alimentos",
    # --- Segunda tanda: FORMA y ESTADO. Medidos 2026-08-01 sobre 2562 productos ---
    # Degradar los seis da **+137 productos que empiezan a resolver contra −63 que dejan**, y las
    # bajas eran errores: `SIMILAC POLVO 800 GR` (fórmula infantil) y `LEVAPAN AZUCAR POLVO` se
    # clasificaban como «Bebidas En Polvo».
    #
    # Ganan 137 por un efecto que no es obvio: quitar el token ambiguo deja que el OTRO token del
    # nombre decida solo. `Detergente Líquido Ariel` pegaba «Té Líquido» Y «Detergentes», se
    # abstenía por ambigüedad, y ahora resuelve por `detergente`.
    #
    # Reportado desde la consola: `Jabon Liquido Intimo Borasol` no se clasificaba porque el ORIGEN
    # decía «Higiene Íntima» (correcto) y el NOMBRE decía «Té Líquido» por `liquido` → conflicto.
    "liquido", "liquida", "liquidos", "liquidas",
    "polvo", "polvos",
    "congelado", "congelada", "congelados", "congeladas",
    "integral", "integrales",
    "barra", "barras",
    # --- Tercera tanda: `crema`. Medido 2026-08-01 sobre el corpus real ---
    # 71 productos llevan el token; **sólo 4 son crema agria — el 94% NO lo es**. Nombra una FORMA
    # (algo cremoso), no una clase, y aparece en rubros que no se tocan entre sí: `Crema Dental
    # Colgate`, `Azúcar Crema Líder`, `Crema Para Peinar Cantu`, `Crema Espumosa Para el Acne
    # Cerave`, `Queso Azul En Crema President`.
    #
    # Caso reportado desde la consola: `Chocolate Con Crema De Cacao Y Avellanas Torras`, origen
    # «Despensa > Mermeladas y Untables > Crema de Avellana», terminaba en «Crema Agria» con **0.97
    # y auto_link**. Peor que una abstención: `crema` secuestraba el segmento más hondo del path de
    # origen (`lexicon_match_path` retorna al primer hit y nunca llegaba a «Mermeladas y Untables»,
    # que era el correcto), y como origen y nombre consultan el MISMO índice, ambos pegaban por el
    # mismo token, «coincidían», y esa falsa independencia se premiaba como refuerzo.
    #
    # «Crema Agria» sigue alcanzable por `agria`, su token de clase.
    "crema", "cremas",
    # `pasta` — mismo defecto, destapado al degradar `crema`. 67 productos lo llevan y **42 (63%)
    # son de higiene oral**. Con `crema` fuera, los dentífricos dejaban de caer en «Crema Agria»
    # sólo para caer en «Pastas»: cambiar una etiqueta equivocada por otra, no un arreglo.
    #
    # La simulación cruda dice −6 y ENGAÑA: de las 9 «pérdidas», 7 son falsos positivos que se
    # corrigen (`VICTORINA PASTA TOMATE` ×4 —pasta de TOMATE—, `Pasta de Dientes Colgate` ×2 y una
    # pizza). Balance real: **33 falsos positivos corregidos contra 2 pérdidas genuinas**
    # (`Pasta Fusilli/Spaghetti Jovial`, que conservan su señal de origen).
    "pasta", "pastas",
    # `infantil` — el peor de los tres: **67 productos lo llevan y CERO son detergente (100% de
    # error)**. Nombra al DESTINATARIO (para niños), no la clase: fórmulas, cereales (`NESTUM
    # Cereal Infantil`), cepillos (`BRAVO CEPILLO INFANTIL`). Reportado por la traza de la consola:
    # `Fórmula Infantil Similac 2 5HMO` salía «Detergente Infantil De Bebé» con 0.95 y auto_link —
    # comida de bebé como producto de limpieza.
    #
    # COSTO ASUMIDO: «Detergente Infantil De Bebé» queda sin tokens (inalcanzable por LÉXICO). No
    # queda huérfana en la cascada: sigue alcanzable por vector y por el juez, que desde este mismo
    # cambio recorre TODOS los candidatos de la banda gris y no sólo el top-1.
    "infantil", "infantiles",
})


def _singular(token: str) -> str:
    """Plural español → singular, para que el número gramatical no separe el mismo concepto.

    Medido 2026-08-01: la hoja se llama «Alimento Para Perro» (singular) y la tienda categoriza en
    «Alimentos para perros» (plural), así que el path de origen NO resolvía y comida de perro
    terminaba clasificada por el `arroz` de su nombre.

    Es un stem deliberadamente simple, no un lematizador: se aplica dentro de `_tokens`, o sea a
    AMBOS lados (construcción del índice y consulta). Esa simetría es la que lo hace seguro — un
    stem imperfecto (`jueves`→`juev`) deja las dos puntas en la misma forma y se siguen
    encontrando; lo único que un stem malo puede provocar es que dos hojas colisionen en un token,
    y ese caso ya está cubierto: el token pasa a ser AMBIGUO y se descarta, que es el lado
    conservador.

    El piso de longitud evita comerse palabras cortas ("gas" no debe volverse "ga").
    """
    if not token.endswith("s") or len(token) <= 3:
        return token
    # En español el plural de una palabra terminada en VOCAL es sólo `-s` (detergente→detergentes,
    # legumbre→legumbres); el `-es` es para las terminadas en consonante (papel→papeles).
    # Quitar siempre "es" partía mal el primer caso: `Detergentes` daba `detergent` mientras el
    # producto decía `Detergente` → `detergente`, y no se encontraban nunca. Se prefiere quitar
    # sólo la "s" cuando lo que queda termina en vocal.
    sin_s = token[:-1]
    if sin_s and sin_s[-1] in "aeiou":
        return sin_s
    if len(token) > 4 and token.endswith("es"):
        return token[:-2]
    return sin_s


def _tokens_with_surface(text: str) -> list[tuple[str, str]]:
    """(forma tal como aparece, forma normalizada) de cada token útil.

    Las dos formas se conservan porque tienen consumidores distintos: la NORMALIZADA es la llave
    del índice (ahí el número gramatical no debe separar), y la de SUPERFICIE es la que
    `lexicon_suggestions` le muestra a una persona — un humano necesita leer «aceites», no «aceit».
    """
    pares = []
    for surface in slugify(text).split("-"):
        stem = _singular(surface)
        if len(stem) >= _MIN_TOKEN_LEN and stem not in _STOPWORDS:
            pares.append((surface, stem))
    return pares


def _tokens(text: str) -> list[str]:
    return [stem for _, stem in _tokens_with_surface(text)]


def build_lexicon_index(
    leaves: list[tuple[str, str]], demoted: frozenset[str] | None = None
) -> LexiconIndex:
    """(node_id, subcategoría) → índice token→node_id, descartando los tokens que no identifican.

    TRES exclusiones, por razones distintas:

    1. **AMBIGUO** (aparece en >1 hoja) — no puede elegir entre ellas. Emerge de la taxonomía sola,
       sin curación.
    2. **ATRIBUTO** (`_ATTRIBUTE_TOKENS`) — aparece en una sola hoja pero describe una propiedad,
       no la clase. Lista corta, en código, con un caso medido por entrada.
    3. **DEGRADADO** (`demoted`) — MEDIDO sobre el corpus real: el token existe en una sola hoja,
       pero los productos que lo llevan no caen en esa raíz. Es dato, no código, y se recalcula.

    Sobre (3) — **la medición sólo puede QUITAR, nunca dar**. Un token se degrada con evidencia en
    contra; sin evidencia queda como está. Por eso `demoted=None` reproduce exactamente el
    comportamiento previo: si la medición nunca corrió, o corrió sobre pocos datos, el índice no se
    vacía. Medido 2026-08-01 sobre 2562 productos: 19 tokens degradables, entre ellos `polvo`
    («Bebidas En Polvo» vs. detergente en polvo) y `pasta` («Pastas» vs. pasta dental).

    Los tokens de `demoted` **y los de `_ATTRIBUTE_TOKENS`** se normalizan igual que cualquier otro:
    si no se aplicara el mismo plegado a las dos puntas, degradar «polvos» no alcanzaría a «polvo» y
    la degradación no pegaría.

    El plegado de `_ATTRIBUTE_TOKENS` faltaba y se agregó 2026-08-01: el índice guarda tokens YA
    plegados, así que toda entrada cuyo stem difiriera de sí misma era LETRA MUERTA. Golpeaba justo
    a los plurales de palabra terminada en consonante, donde el plegado no es identidad
    (`infantiles`→`infantile`, `integrales`→`integrale`): ambas estaban en la lista y ninguna hacía
    nada. Las que terminan en vocal (`cremas`→`crema`) funcionaban por casualidad, porque su stem
    coincide con la entrada singular que también estaba escrita.
    """
    excluidos = {_singular(t) for t in _ATTRIBUTE_TOKENS} | {
        _singular(t) for t in (demoted or frozenset())
    }
    token_to_nodes: dict[str, set[str]] = {}
    for node_id, name in leaves:
        for token in _tokens(name):
            if token in excluidos:
                continue
            token_to_nodes.setdefault(token, set()).add(node_id)
    return {token: next(iter(nodes)) for token, nodes in token_to_nodes.items() if len(nodes) == 1}


def lexicon_match(name: str, index: LexiconIndex) -> tuple[str, float] | None:
    """Nombre del producto → (leaf_node_id, confianza) si pega tokens de UNA sola hoja; si no None."""
    hits = {index[token] for token in _tokens(name) if token in index}
    if len(hits) == 1:
        return next(iter(hits)), LEXICON_CONFIDENCE
    return None


def matched_tokens(name: str, index: LexiconIndex) -> tuple[str, ...]:
    """Tokens del índice que pegaron en `name`, en forma de SUPERFICIE (para registro y diagnóstico).

    Separado de `lexicon_match` a propósito: aquél DECIDE y su firma la consumen 4 call-sites; éste
    sólo observa. Sirve para responder "¿qué token causó esta decisión?" sin reproducir la cascada —
    la pregunta que hoy obliga a re-correr el clasificador producto por producto.
    """
    return tuple(surface for surface, stem in _tokens_with_surface(name) if stem in index)


def lexicon_match_path(source_category: str, index: LexiconIndex) -> tuple[str, float] | None:
    """Categoría de ORIGEN (path jerárquico "A > B > C") → hoja. Matchear el string entero mezcla
    tokens de varios niveles y crea ambigüedad falsa; se matchea segmento a segmento, del más
    específico (hondo) al general, tomando el primer hit inequívoco. Compartido por el clasificador
    (`ClassifyStoreProduct`) y el matcher (category gate/boost, Etapa C)."""
    if not source_category:
        return None
    for segment in reversed(source_category.split(" > ")):
        hit = lexicon_match(segment, index)
        if hit is not None:
            return hit
    return None


def lexicon_suggestions(
    name: str,
    index: LexiconIndex,
    *,
    brand: str | None = None,
    limit: int = 5,
) -> list[CategorySuggestion]:
    """Hojas candidatas rankeadas para que elija un HUMANO (US-CP-D2c).

    Distinto de `lexicon_match` a propósito: aquél DECIDE (una hoja o `None` si hay ambigüedad);
    éste EXPONE la evidencia para que decida una persona. Por eso varias hojas pueden convivir en
    el resultado — lo que allá es ambigüedad, acá es justamente la lista de opciones.

    Sin tokens que peguen devuelve `[]`: la regla sagrada del clasificador es no inventar categoría,
    y el árbol completo queda como fallback. Los tokens ambiguos ya vienen descartados del índice.
    """
    seen: dict[str, list[str]] = {}
    # Se busca por la forma NORMALIZADA (la llave del índice) pero se reporta la de SUPERFICIE: la
    # lista viaja a la consola para que una persona la lea, y «aceit» no es una palabra.
    # Deduplica por normalizada preservando el orden — repetir un token no puede inflar el ranking —
    # y conserva la primera superficie vista para cada una.
    vistos: dict[str, str] = {}
    for surface, stem in _tokens_with_surface(f"{name} {brand or ''}"):
        vistos.setdefault(stem, surface)
    for stem, surface in vistos.items():
        node_id = index.get(stem)
        if node_id is not None:
            seen.setdefault(node_id, []).append(surface)

    suggestions = [
        CategorySuggestion(taxonomy_node_id=node_id, matched_tokens=tokens)
        for node_id, tokens in seen.items()
    ]
    # Más tokens = más evidencia. Empate → orden estable por id para que la lista no baile.
    suggestions.sort(key=lambda s: (-s.strength, s.taxonomy_node_id))
    return suggestions[:limit]
