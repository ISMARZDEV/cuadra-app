---
name: cuadra-chat-suggestions
description: >
  El carrusel de SUGERENCIAS del dock del chat (`features/aispace` + `components/ui/pill-*`): la
  cascada de 3 niveles que decide qué sugerir (historial → catálogo de Save por pg_trgm → LLM), el
  historial persistido, el shimmer de Skia, el truncado a 2 líneas y el popover al mantener
  oprimido (iOS nativo `expo-ios-popover` / fallback JS). Dueña además de las VARIANTES de
  `PillButton` (`brand`/`surface`), su truncado y sus callbacks de hold.
  Trigger: tocar el carrusel de sugerencias, `quick-actions.tsx`, `use-live-suggestions`,
  `use-suggestions`, `suggestion-usage-store`, `pill-hold-popover`, `android-hold-popover`,
  `use-is-truncated`, `suggestion-skeleton`, el endpoint `POST /aispace/suggest`, o las variantes /
  el truncado / el hold de `PillButton`.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
---

> **Composes — no dupliques.** La FORMA de la píldora (canto en degradado, `useId` en `<Defs>`,
> `icon` como nodo) es de **`cuadra-chat-input`**. El dock, el anclaje y la geometría del teclado
> son de **`cuadra-aispace`**. El backend hexagonal es de **`cuadra-api`**. Esta skill es el
> SUBSISTEMA de sugerencias: qué se sugiere, cómo se pinta y cómo se revela.
>
> **Plan de referencia: `docs/chat-sugerencias-vivas.md`** — cada decisión de acá está ahí con su
> porqué largo. Leelo antes de cambiar la arquitectura.

## When to Use

- Añadir/cambiar sugerencias, su orden, su origen o sus plantillas i18n.
- Tocar la cascada (`use-live-suggestions`), el typeahead, o el endpoint LLM.
- Tocar el truncado de la píldora, el popover de "mantener oprimido", o el esqueleto de carga.
- Editar `PillButton` en lo que hace a variantes, `maxWidth`/`maxLines` o `onHoldReveal/Release`.

## Critical Patterns

### 1. La cascada — determinista primero, LLM como ÚLTIMO recurso

```
T0  historial del usuario (top-3)      0 tokens · 0 ms
T1  /save/search + plantillas i18n     0 tokens · ~150 ms · debounce 300 ms
T2  POST /aispace/suggest (LLM)      ~200 tok · ~600 ms · debounce 700 ms
```

- **T2 NO se llama si T1 acertó**, y tampoco mientras T1 sigue en vuelo (sería pagar por algo que
  llegaba gratis). Hay test, verificado por mutación — es el que paga la arquitectura.
- **Degrada sola**: sin producto y sin modelo se cae al catálogo estático. Nunca queda vacía.
- El endpoint va **AUTENTICADO** aunque no lea nada del usuario: un endpoint de LLM abierto es una
  canilla de dinero.

### 2. `word_similarity` obliga a buscar la ÚLTIMA PALABRA, no la frase

`search_lexical` mide los trigramas de la query COMPLETA contra un tramo CONTIGUO del nombre.
Mandarle «Donde estan los guan» contra «Guandules Verdes Goya» puntúa casi cero — las palabras de
relleno arrastran el puntaje al piso. Con «guan» suelto, calza. Vive en `typeaheadQuery()`.

> Si un producto de dos palabras deja de resolverse: probar las DOS últimas palabras y quedarse con
> el mejor puntaje. **NUNCA bajar el piso de 0.35** (doctrina de discriminación, `cuadra-save`).

### 3. Lo que se CUENTA es la clave, no el texto

El historial (`suggestion-usage-store`, persistido en `expo-secure-store`) cuenta por **clave i18n**
(`chat.quickActions.savingTip`), jamás por el texto renderizado: contando el texto, el mismo usuario
tendría un historial distinto por idioma. Las sugerencias generadas cuentan bajo **una sola clave**
(`chat.suggest.completion`) porque el hábito es "acepta lo que le completan", no cada frase suelta.

### 4. Plantillas i18n: prohibido exigir concordancia con `{product}`

`"¿Dónde están los {product} más baratos?"` se rompe con un producto femenino
(*"los Crema Coco… más baratos"*). El nombre viene del catálogo: puede ser cualquier género/número.

**Técnica:** ligar artículo y adjetivo a un sustantivo **FIJO** — `"el mejor precio de {product}"`
concuerda con *precio*, no con X. Aplica a es/pt; inglés no tiene el problema.

> El fixture «Guandules Verdes Goya» es masculino plural y concordaba **por casualidad**: escondió
> el bug en TODOS los tests. Probar siempre con un caso de género/número contrario.

### 5. La regla del RELOJ de Skia (esto ya costó rendimiento una vez)

`useClock` late mientras el componente esté **MONTADO** — ocultarlo por opacidad **no lo detiene**
(la lección de `orb-sphere.tsx`). Por eso:

- `SuggestionSkeleton` **reemplaza** a la lista (`if (isResolving) return <Skeleton/>`), no se
  superpone.
- `ResolvedProductHeader` se **monta sólo cuando hay producto** y desaparece del árbol si no.

`ShimmerText` sólo sirve para TEXTO (recibe `text: string`, mide con métricas de fuente, pinta los
glifos). Para vistas —las píldoras— hay un esqueleto propio: UN Canvas, N `RoundedRect`, un
degradado en coordenadas de canvas para que la luz cruce la fila como una sola onda.

### 6. Truncado a 2 líneas — medir ALTO, no ancho

| Regla | Por qué |
|---|---|
| `lineHeight` **explícito** en `PILL_LABEL_STYLE` | sin él RN lo deriva de la fuente y varía por plataforma → "¿pasa de N líneas?" deja de ser calculable |
| se mide el **ALTO** (`exceedsLines`) | con el ancho ya restringido el texto envuelve solo: su alto ES su número de líneas |
| media línea de **tolerancia** | el alto medido nunca cae exacto en `lineHeight × n` (redondeo sub-pixel) |
| `maxWidth` en el **CONTENEDOR** + `flexShrink: 1` en el texto | en el texto, una etiqueta que envuelve reserva el ancho completo y deja aire muerto: la píldora deja de abrazar su contenido |
| se mide con el ancho que le queda al **TEXTO** (`maxWidth − padding×2`) | contra el ancho total entra una línea de más y el `…` aparece tarde |
| `PILL_HEIGHT` se **DERIVA** (`lineHeight × maxLines + padding×2`) y vive junto a `PILL_MAX_LINES` | separados, subir el tope de líneas recorta el texto por la CAJA en vez de por el `…`: recorte sin puntos suspensivos y sin gesto — falla silenciosa |

El texto-fantasma que mide va **`aria-hidden`**: sin eso la etiqueta existe dos veces en el árbol y
un lector de pantalla la lee repetida.

### 7. El popover: dos implementaciones, nunca dos dueños del gesto

`expo-ios-popover` es **100% iOS** (`"platforms": ["apple"]`, sin carpeta `android/`, usa
`UIPopoverPresentationController`). Android va por JS (`android-hold-popover.tsx`, calcado de
`info-tooltip.tsx`: Modal para escapar el `cardClip` radius 48 del chat).

```
resolveHoldStrategy({ isTruncated, isIOS, nativeAvailable })
  → "none"    el texto entra entero: no hay nada que revelar
  → "native"  iOS + módulo en el binario
  → "js"      todo lo demás
```

- **El módulo nativo cuelga un `UILongPressGestureRecognizer` de UIKit** sobre el `Trigger`, sin
  `cancelsTouchesInView = false`. Por eso en iOS `PillButton` **no** recibe `onHoldReveal`: el gesto
  vive entero en el nativo. En JS lo gobierna el `Pressable`. Nunca los dos.
- **Guard obligatorio**: `requireOptionalNativeModule("ExpoiOSPopoverModule") !== null`. Sin él,
  cualquier binario sin el módulo pinta `Unimplemented component: <ViewManagerAdapter_…>` en TODAS
  las píldoras — mucho peor que no tener popover.
- `Pressability` de RN **ya suprime `onPress` tras un long-press** (`Pressability.js:749-752`). No
  escribas un guard manual: sería código muerto.

### 8. El dock NO se cierra al enviar (es el arreglo de un bug, no una preferencia)

`scrollMessageToEnd` no scrollea al mensaje: hace `scrollToEnd` y confía en que `anchoredEndSpace`
reservó el blanco justo. Esa reserva se calcula contra el viewport **y** el `paddingBottom`
(`8 + bottomZoneH`). Cerrar el dock al enviar hacía caer `bottomZoneH` ~60pt **de golpe** en mitad
del scroll y el mensaje aterrizaba detrás del header.

## Lo que NO se puede testear bajo jsdom (decirlo, no fingirlo)

| No testeable | Por qué |
|---|---|
| medición de layout (`onLayout`, `.measure()`) | RNW lee `node.offsetWidth/Height` (`UIManager/index.js:17-19`), no `getBoundingClientRect` — lo único que `setup.ts` falsea. Siempre 0. |
| el gesto de long-press | su timer vive en el sistema de responder LEGADO de RNW, que escucha eventos NATIVOS del `document`. Probado con `mouseDown` y `pointerDown`: no dispara. |
| `Platform.OS === "ios"` | siempre es `"web"`. **Extraé la decisión a función pura** o el guard pasa por la razón equivocada. |
| el shimmer | el stub de Skia nunca avanza el reloj. |

**Método:** lo medible se aísla en funciones puras (`exceedsLines`, `resolveHoldStrategy`) y se
prueba de verdad; lo demás se MOCKEA y se verifica en device.

> **Mutá el CABLE, no sólo las piezas.** Dos huecos reales aparecieron sólo mutando: borrar
> `draft={draft}` de `<QuickActions>` dejaba TODA la suite verde, y el mock de `useIsTruncated`
> tapaba que se midiera con el ancho equivocado.

## Commands

```bash
pnpm --filter @cuadra/mobile test        # 246 tests
pnpm --filter @cuadra/mobile typecheck
cd apps/api && LANGSMITH_TRACING=false uv run pytest tests/aispace -q

# Módulo nativo nuevo → el JS recargado sobre un dev-client viejo da "Unimplemented component"
npx expo prebuild --platform ios
cd ios && npx pod-install     # ⚠️ prebuild REUSA ios/ y NO corre pod install
npx expo run:ios --port 8087  # ⚠️ run:ios IGNORA el --port del script `start`
```

## Resources

- **Plan de récord**: `docs/chat-sugerencias-vivas.md` (§8 = popover, §8.3 = hallazgos)
- **Carrusel**: `features/aispace/components/{quick-actions,suggestion-skeleton,shimmer-text}.tsx`
- **Cascada**: `features/aispace/{use-live-suggestions,use-suggestions,api}.ts` ·
  `store/suggestion-usage-store.ts`
- **Píldora + popover**: `components/ui/{pill-button,pill-hold-popover,android-hold-popover,use-is-truncated}.tsx`
- **Backend T2**: `contexts/aispace/suggestions.py` · `api/v1/controllers/aispace.py::post_suggest`
- **Referencia nativa**: `rit3zh/expo-ios-popover` (su ejemplo pone el pressable POR FUERA de
  `Popover.Root` — la alternativa si el tap corto se rompe)
