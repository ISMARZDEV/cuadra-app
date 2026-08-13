# Chat de Cuadra — sugerencias VIVAS en el dock

> **Estado:** **COMPLETO — tandas 1 y 2, fases 1 a 9.** 221 tests de móvil + 1652 de backend
> verdes, typecheck / ruff / lint-imports limpios, `make openapi` corrido. Sin commitear.
> **Único pendiente: tu verificación en device (§6).**
> Escrito el 2026-08-09.
>
> ⚠️ En la suite de backend hay **5 rojos PRE-EXISTENTES** en
> `tests/aispace/integration/test_groceries_tools.py` (`no_data: there is no priced catalog for
> this market yet` — la DB local no tiene catálogo con precios sembrado). **Verificado con
> `git stash`: fallan igual sin ninguno de estos cambios.** No son de este trabajo.
> **Origen:** pedido del usuario tras probar el carrusel estático en device — las sugerencias
> deben acompañar al usuario MIENTRAS escribe, no ser un menú que se abre y se cierra.
> **Punto de partida:** rama `feat/chat-suggestions-carousel` (el carrusel estático, sin commitear).
> **Predecesor:** `docs/chat-sugerencias-populares.md` — leerlo primero; este documento lo CONTINÚA
> y le revierte una decisión (§2.0).

---

## §0 · Rol y protocolo

**Typecheck verde y tests verdes NO dicen que la UI funcione.** Casi todo lo de este plan es
geometría, animación y red: se valida viéndolo en el render real, en AMBOS temas, o no está
validado. Protocolo `cuadra-ui-verify`.

TDD estricto: RED antes que GREEN en todo lo que tenga comportamiento.

Dos tandas, y **la tanda 1 se verifica en device antes de empezar la 2**. No es burocracia: la
tanda 1 cambia la geometría del chat, que es justo donde vive el bug que estamos arreglando. Si la
tanda 2 rompe algo y las dos están sin verificar, no hay forma de saber cuál fue.

No commitear ni pushear salvo pedido explícito en el turno.

---

## §1 · Qué se pide, y qué de eso ya existe

| # | Pedido | Hoy | Brecha |
|---|---|---|---|
| 1 | El dock se queda abierto aunque se abra el teclado | se cierran mutuamente | **revertir** lo de la sesión pasada (§2.0) |
| 2 | Typeahead en vivo: «Donde estan los guan» → «¿Dónde están los guandules más baratos?» | nada | tanda 2 |
| 3 | Shimmer en las píldoras mientras la IA piensa qué sugerir | el shimmer existe, pero **sólo para texto** | componente nuevo (§3.9) |
| 4 | Sugerencias aleatorias, no estáticas | 8 fijas en i18n | tanda 1 |
| 5 | Las 3 más enviadas por el usuario, primero | no hay historial | tanda 1 + persistencia nueva |

### 1.1 · El hallazgo que decide la arquitectura

**El ejemplo del usuario no necesita un LLM.** La máquina para resolver «guan» → «guandules» ya
está construida, desplegada y probada:

| Pieza | Dónde | Estado |
|---|---|---|
| `GET /save/search?q=&market=` | `apps/api/src/api/v1/controllers/save.py` | público, **sin auth**, desplegado |
| Caso de uso | `contexts/save/application/search.py::SearchProducts.execute` | RRF de léxico + semántico |
| Léxico | `contexts/save/infrastructure/repositories.py:634` `search_lexical` | pg_trgm, piso `0.35` |
| Semántico | `repositories.py:657` `search_semantic` | pgvector/BGE-M3, piso `0.46` |
| Fusión | `contexts/save/domain/rank_fusion.py::reciprocal_rank_fusion` | — |
| Hook en el SDK | `searchProducts` en `@cuadra/api-client` | **generado, y el móvil nunca lo importó** |

**Por qué funciona con un prefijo suelto.** `search_lexical` usa `func.word_similarity(query, name)`
y **no** `similarity`. La diferencia es el plan entero: `similarity` diluye el puntaje contra la
unión de trigramas del nombre COMPLETO, mientras que `word_similarity` puntúa contra el
**mejor substring** del nombre. Por eso «guan» puntúa alto contra «Guandules Verdes Goya» en vez de
hundirse por los otros dos tokens.

**Y ya hay una prueba de que resuelve escrituras rotas** —
`apps/api/tests/save/fixtures/retrieval_queries.py:45`:

```python
LabeledQuery("guandlues wala", "typo", {"Guandules Wala 800 Gr", "Guandules Verdes Wala 15Oz"})
LabeledQuery("gandules", "sinonimo", {…5 productos…})
```

Es literalmente la misma llamada que hace la tool `search_groceries` del GroceriesAgent
(`contexts/aispace/agents/groceries/tools/catalog.py`), sólo que invocada directo desde el móvil en
vez de detrás de un turno completo del LLM.

---

## §2 · Decisiones tomadas ANTES de escribir código

### 2.0 · Lo que este plan REVIERTE (y por qué el bug no vuelve)

La sesión pasada arreglé el bug de anclaje haciendo que **el teclado y el carrusel se excluyeran
mutuamente**. El usuario pide lo contrario, así que se revierten las dos mitades:

- `chat-screen.tsx`, listener `KB_SHOW` → fuera el `setManualOpen(false)`
- `chat-screen.tsx`, `onToggle` del dock → fuera el `Keyboard.dismiss()`
- `chat-screen.test.tsx` → fuera el test *"closing the keyboard is part of opening the suggestions
  carousel"*

**El bug no vuelve, y el motivo importa.** Eran TRES geometrías compitiendo durante el envío:

| | qué se mueve | cuánto |
|---|---|---|
| A | el teclado cerrándose → la tarjeta crece (`marginBottom` animado) | ~235pt |
| B | el dock colapsando → cae `bottomZoneH` → cae el `paddingBottom` | ~60pt, **de golpe** |
| C | el `scrollToEnd` del anclaje | — |

La exclusión mutua atacaba **A**. Este plan ataca **B**, que es la que de verdad sobraba: *el dock
deja de cerrarse al enviar*. Con B eliminada, enviar desde una píldora queda con el mismo perfil
geométrico que enviar desde el input (A + C) — el camino que ya estaba depurado y que el usuario
confirmó que funciona.

> ⚠️ Es una hipótesis razonada sobre código que leí, **no verificada en device**. Es el punto 1 de
> la verificación y lo primero que hay que mirar. Si falla, la siguiente sospecha es que `B` no se
> eliminó del todo: `ChatDock` anima *opacity* y *transform*, **no** *height*, así que el alto sólo
> cae cuando el cuerpo se desmonta al asentar el resorte (`chat-dock.tsx:50-51`).

### 2.1 · Motor de sugerencias: cascada de tres niveles

Misma doctrina que ya rige el matching de Save (`cuadra-save-matching`): **determinista primero,
LLM como último recurso**.

| Nivel | Qué es | Tokens | Latencia |
|---|---|---|---|
| **T0** | historial del usuario (3 más enviadas) | 0 | 0ms |
| **T1** | `/save/search` + plantillas i18n | 0 | ~150ms |
| **T2** | LLM, **sólo si T0/T1 quedan flojos** | ~200 | ~600ms |

T2 dispara por **inactividad**, no por pulsación, y se cachea por prefijo normalizado: ~1-2 veces
por mensaje compuesto, no una por tecla.

**T1 cubre el ejemplo del usuario entero.** T2 existe para lo que T1 no puede ver: «cuánto gasté
este mes» no matchea ningún producto del catálogo, porque no es un producto.

**T2 degrada solo.** Sin endpoint disponible, la cascada se queda con T0/T1 — exactamente como
`search_semantic` se salta el nivel semántico cuando no hay embedder configurado, en vez de
fabricar un vector.

### 2.2 · Shimmer: píldoras fantasma en Skia, no el ShimmerText existente

`shimmer-text.tsx` **no se puede reusar**, y no por gusto:

- Recibe `text: string`, lo mide con `font.measureText` / `getMetrics()` y pinta **los glífos** con
  un `LinearGradient` como relleno. No tiene `children`. No envuelve una vista con fondo y borde.
- Usa la fuente del **SISTEMA** vía `matchFont` (omitiendo `fontFamily`), mientras la píldora usa
  **Kantumruy**. Reusarlo sobre la etiqueta obligaría a registrar Kantumruy en el FontMgr de Skia —
  no verificado.
- Serían N canvas con N relojes.

La solución: **UN `<Canvas>` con N `RoundedRect` y un solo degradado barriendo**, con la técnica
exacta de `shimmer-text.tsx:64-70` (`useClock` + `useDerivedValue`). Un reloj, una draw call, y sin
problema de fuente porque no hay texto que dibujar.

> ⚠️ **La regla del reloj** (`shimmer-text.tsx:25-30`, aprendida a golpes en `orb-sphere.tsx`):
> `useClock` late mientras el componente esté **MONTADO**; ocultarlo por opacidad **no lo detiene**.
> El esqueleto **se desmonta** cuando no está resolviendo. No se oculta.

### 2.3 · Persistencia: `expo-secure-store` a mano, no una librería nueva

En este repo **no existe** `@react-native-async-storage/async-storage` ni `react-native-mmkv`, y el
middleware `persist` de zustand **no se usa en ningún lado**. Lo que sí existe es un patrón
hecho a mano, con dos usos reales: `features/auth/use-auth-store.tsx` y
`features/settings/use-language-store.tsx`.

Se calca ese patrón: store zustand + `SecureStore` + bandera `restored` + helper `persist()`. No se
agrega una dependencia para guardar un diccionario de contadores.

### 2.4 · El historial se cuenta por CLAVE i18n, nunca por el texto renderizado

Contar el texto fragmentaría el historial en tres al cambiar de idioma: el mismo usuario tendría
dos historiales distintos de la misma sugerencia por haber pasado de es a en. La clave
(`chat.quickActions.spentThisMonth`) es la identidad; el texto es sólo su presentación.

---

## §3 · Fases

### TANDA 1 — la base, sin red

#### Fase 1 — El dock deja de cerrarse solo (riesgo: es el arreglo del bug)

`apps/mobile/src/features/aispace/chat-screen.tsx`

- `QuickActions.onSelect` → quitar `setManualOpen(false)`.
- Revertir las dos mitades de la exclusión mutua (§2.0).
- El dock lo abre y lo cierra **sólo el handle**, o un flujo HITL que se lo apropie
  (`chat.interaction`, que ya lo hace en `chat-screen.tsx:200-202`).

#### Fase 2 — Store de popularidad, persistido

`apps/mobile/src/store/suggestion-usage-store.ts` (nuevo)

```ts
const USAGE_KEY = "cuadra.suggestionUsage";
type Usage = Record<string, number>;     // clave i18n → veces enviada

{ usage, restored, restore(), record(key) }
```

`restore()` se engancha donde ya se restaura el idioma (root layout). Ver §2.3 y §2.4.

#### Fase 3 — Orden: 3 más usadas + el resto barajado

`apps/mobile/src/features/aispace/use-suggestions.ts` (nuevo)

```
[ top-3 por contador ]  ++  [ el resto, barajado ]
```

La aleatoriedad sigue la doctrina **ya escrita** en `use-status-sequence.ts:38-39`:

> *"El arranque aleatorio se decide UNA vez por tanda (no en cada render, o la palabra saltaría
> sola entre frames)."*

Y `random: () => number = Math.random` se **inyecta**, para fijarlo en los tests — igual que ahí.
Tanda nueva = al abrir el dock y después de cada envío.

#### Fase 4 — Tests (RED primero)

- las 3 más enviadas van primero
- el resto se baraja con `random` inyectado → orden determinista bajo test
- enviar una sugerencia sube su contador **por clave**, y sobrevive a un cambio de idioma
- `QuickActions.onSelect` **no** cierra el dock

#### Lo que la tanda 1 destapó del harness de tests

Dos infidelidades del harness que sólo aparecieron al ejercitar caminos nuevos. Las dos se
arreglaron **en el stub**, no rodeándolas en el código de producción:

1. **`legend-list-keyboard-stub.tsx`**: `scrollMessageToEnd` devolvía `undefined`. La real es
   `async` (`keyboard.js:67`) y el call site encadena un `.then()` para volver a congelar, así que
   reventaba en cuanto un test llegaba a **enviar** un mensaje — nunca había pasado porque ningún
   test llegaba tan lejos.
2. **`expo-secure-store` no estaba stubbeado**. Su implementación llama al módulo nativo
   `setValueWithKeyAsync`, y el fallo **no aparece al importar sino al ESCRIBIR** — se manifestaba
   como "unhandled error" en cualquier test que tocara una acción que persiste. Ahora hay
   `src/test/secure-store-stub.ts` aliaseado en `vitest.config.ts`, **con memoria** (escribir y
   volver a leer funciona): un stub que devolviera siempre `null` convertiría «se persistió mal» en
   «el test pasa igual».

---

### TANDA 2 — el typeahead

#### Fase 5 — Sacar el texto del input hacia arriba

`chat-input-bar.tsx` gana `onChangeText?: (text: string) => void`.

**Va DENTRO de `handleChangeText`, después del guard de eco** (`chat-input-bar.tsx:216-225`), nunca
colgado del `onChangeText` crudo del `TextInput`. Ese guard traga un evento de autocorrección de
iOS justo después de cada envío; un typeahead colgado del evento crudo leería ese fantasma como
«el usuario borró todo y empezó de nuevo».

#### Fase 6 — Debounce

`apps/mobile/src/lib/hooks/use-debounced-value.ts` (nuevo)

**No existe ningún debounce en el repo** (grep de `debounce|throttle` = 0 resultados) y lodash no
es dependencia. Se escribe uno mínimo; no se agrega una librería por quince líneas.

#### Fase 7 — T1: `/save/search` + plantillas

`apps/mobile/src/features/aispace/api.ts` (nuevo) — **primer uso de `searchProducts` en el móvil**.

```ts
useQuery({
  queryKey: ["aispace", "typeahead", debounced],
  queryFn: () => searchProducts({ query: { q: debounced, market } }),
  enabled: debounced.trim().length >= 3,
  placeholderData: keepPreviousData,
})
```

> ⚠️ **No hay precedente en el repo** de `enabled` ni de `placeholderData`: todos los `useQuery`
> actuales son fetch-on-mount con `refetchInterval` (`features/save/api.ts`,
> `features/insights/api.ts`). Se está estrenando el patrón — documentarlo en el archivo.

Plantillas nuevas en i18n con slot `{product}` (la función `t()` ya interpola `{name}`):

```json
"chat.suggest.whereCheapest": "¿Dónde está el mejor precio de {product}?",
"chat.suggest.howMuch": "¿Cuánto cuesta {product}?",
"chat.suggest.compare": "Compara precios de {product}"
```

> **Corrección post-implementación (detectada por el usuario en device).** La primera versión de
> `whereCheapest` era `"¿Dónde están los {product} más baratos?"` — exige que `{product}` concuerde
> en género y número, y un nombre de catálogo es un string arbitrario, no algo que el template
> pueda anticipar. Con «Guandules Verdes Goya» (masculino plural) concordaba **de casualidad**, y
> ese acuerdo casual escondió el bug en todos los tests hasta que el usuario probó con «Crema Coco
> La Famosa 15 Oz» (femenino singular): *"¿Dónde están los Crema Coco... más baratos?"*, roto.
>
> Arreglo: ligar el artículo/adjetivo a un sustantivo FIJO (`"el mejor precio de {product}"`) en vez
> de al producto — así ninguna concordancia depende de un nombre que no controlamos. Mismo problema
> en portugués (`mais barato/-a/-os/-as`), mismo arreglo. Inglés nunca lo tuvo — sin género
> gramatical, `"Where is {product} cheapest?"` es válido para cualquier `{product}`.
>
> Se agregó un test que usa un producto de género/número DISTINTO al fixture original
> (`use-live-suggestions.test.ts` → *"stays grammatically correct for a product of a DIFFERENT
> gender and number"*), verificado por mutación. La lección: un test con un solo fixture puede
> pasar por la razón equivocada si ese fixture concuerda por casualidad con la regla rota.

#### Fase 8 — T2: el LLM, sólo cuando los otros fallan ✅

**Backend** — `contexts/aispace/suggestions.py` + `POST /aispace/suggest`.

**No hay puerto nuevo, y es deliberado.** `get_chat_model` YA es el puerto del modelo (§7.8), así
que un `SuggestionGenerator` encima habría sido una capa que no invierte ninguna dependencia nueva.
Se sigue el precedente exacto de `flows/expense/categories.py`, que es el consumidor de LLM que no
es un agente: una función, salida estructurada Pydantic, degradación silenciosa.

Decisiones del borde:

- **AUTENTICADO**, aunque no lea nada del usuario: cada llamada gasta tokens, y **un endpoint de
  LLM abierto es una canilla de dinero** para cualquiera que lo encuentre.
- **El idioma sale del locale que ELIGIÓ el usuario**, no de detectarlo sobre el borrador — un
  fragmento a medio escribir es pésima evidencia para un detector. Mismo criterio que `ui_language`.
- **Sin caché de servidor**: el cliente ya cachea por prefijo (30 min) y sólo pregunta tras una
  pausa. Un segundo caché sería complejidad sin llamadas que ahorrar.
- `«Complete, don't answer»` es la línea del prompt que carga el peso: sin ella el modelo RESPONDE
  la pregunta en vez de terminar de escribirla, y el carrusel se llena de respuestas en lugar de
  prompts enviables.

**Cliente** — `useDraftCompletions` en `features/aispace/api.ts`, enganchado a la cascada:

```
T1 responde  →  T2 NUNCA se llama            ← el test que paga la arquitectura
T1 vacío     →  T2 tras 700ms de inactividad
T2 vacío     →  catálogo estático
```

**Tres guardas para no gastar de más**, cada una con test:
1. T2 se saltea si T1 acertó (verificado por mutación: quitarlo pone el test en rojo).
2. T2 no dispara mientras T1 sigue en vuelo — sería pagar por algo que estaba por llegar gratis.
3. `useDebouncedValue` ganó un `initial` opcional. Sin él, **montar el dock con texto ya escrito
   disparaba el modelo sin un solo milisegundo de espera** — montar no es evidencia de que el
   usuario se haya detenido. Lo destapó un test, no una revisión.

#### Fase 9 — Shimmer: píldoras fantasma

`apps/mobile/src/features/aispace/components/suggestion-skeleton.tsx` (nuevo)

Ver §2.2 — un Canvas, N `RoundedRect`, un degradado barriendo, y **desmontar** cuando no resuelve.

El esqueleto **reemplaza** a la lista (`if (isResolving) return <Skeleton/>`), no se superpone: eso
es lo que garantiza que el Canvas se desmonte. Hay test, y muerde.

---

### Lo que la tanda 2 destapó (y una decisión que cambió la implementación)

**`word_similarity(query, name)` obliga a buscar la ÚLTIMA PALABRA, no la frase.** Mide el mejor
calce del conjunto COMPLETO de trigramas de la query contra un tramo CONTIGUO del nombre. Mandarle
«Donde estan los guan» contra «Guandules Verdes Goya» puntúa casi cero: las palabras de relleno no
aparecen en el nombre y arrastran el puntaje al piso. Con «guan» suelto, calza de sobra. Vive en
`typeaheadQuery()`, con la limitación conocida documentada (un producto de dos palabras se busca
por la última; si deja de alcanzar, se prueban las DOS últimas — **no** se baja el piso de 0.35).

**Tres infidelidades más del harness**, todas arregladas en el stub:

| Qué | Síntoma |
|---|---|
| `skia-stub` no exportaba `RoundedRect` | "Element type is invalid" al montar el esqueleto |
| Ningún wrapper de TanStack Query compartido | "No QueryClient set" en 7 tests al volverse `QuickActions` un consumidor de red |
| (tanda 1) `legend-list-keyboard-stub` y `expo-secure-store` | ver arriba |

El wrapper se extrajo a `src/test/query-wrapper.tsx` cuando lo pidió el tercer archivo — el patrón
venía copiado a mano desde `features/insights/api.test.tsx`.

**Un hueco de cobertura que sólo apareció por mutar el código.** El primer intento de blindar el
cable dejaba pasar la mutación: borrar `draft={draft}` de `<QuickActions>` mantenía **toda** la
suite en verde. Cada tramo estaba probado por separado y nadie miraba la unión. Se agregó
`chat-screen.test.tsx → "what you type reaches the suggestions"`, que escribe en el input de verdad
y verifica que la sugerencia cambie. Ahora sí muerde.

---

## §4 · Lo que este plan NO toca

- `ChatEmptyState` — la rejilla de widgets del chat vacío, otra historia.
- `DockInteractionView` — las píldoras del flujo HITL tienen su propio contrato (`DockOption`) y su
  paleta invertida; no comparten estilo con las sugerencias por diseño.
- El contador de mensajes gratis del input (`PillButton variant="brand"`) — sigue intacto.
- La geometría del anclaje en sí: no se compensan alturas ni se agregan timeouts. Se **elimina** el
  cambio de layout que sobraba.

---

## §5 · Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| El anclaje sigue fallando tras quitar el colapso del dock | Es la hipótesis central; punto 1 de la verificación. Siguiente sospecha en §2.0. |
| El reloj de Skia queda latiendo con el esqueleto invisible | Desmontar, no ocultar. La regla está en §2.2 con su precedente (`orb-sphere`). |
| Una llamada a `/save/search` por tecla | Debounce por inactividad + `enabled` con piso de 3 caracteres + `placeholderData` para no parpadear. |
| El historial se reinicia al cambiar de idioma | Se cuenta por clave i18n (§2.4). Hay test. |
| Sugerencias que saltan solas entre frames | La baraja se decide una vez por tanda, no en cada render (§Fase 3). |
| El dock abierto come viewport del chat | Es la consecuencia aceptada de que el dock sea una superficie viva. Verificar que la conversación siga cómoda. |

### Lo que NO se puede testear con vitest, y hay que decirlo en voz alta

- **El shimmer**: el stub de Skia (`src/test/skia-stub.tsx`) nunca avanza el reloj — su propio
  comentario dice que el barrido «es un visual, se verifica en device».
- **La geometría del anclaje**: jsdom no hace layout; `src/test/setup.ts` clava
  `getBoundingClientRect` a 390×800.
- **El peek horizontal** del carrusel, por lo mismo.

Y el recordatorio de siempre: **los vitest de mobile no gatean CI** —
`.github/workflows/ci.yml` (job `mobile`) sólo corre `typecheck`.

---

## §6 · Verificación

```bash
pnpm --filter @cuadra/mobile test
pnpm --filter @cuadra/mobile typecheck
cd apps/api && uv run pytest tests/aispace -q      # sólo si se hace la Fase 8
```

**En device — el orden importa, tanda 1 primero:**

1. **El anclaje.** Dock abierto + teclado abierto → tocar una sugerencia → el mensaje aterriza donde
   debe, no detrás del header. *Es la hipótesis central de todo el plan.*
2. El dock **no** se cierra al abrir el teclado ni al enviar.
3. Dos aperturas seguidas del dock → orden distinto, pero las 3 más usadas siempre primero.
4. Matar la app y reabrir → el historial sobrevive.
5. Cambiar de idioma → el historial **no** se reinicia.
6. *(Tanda 2)* escribir «guan» → píldoras con guandules; el shimmer se ve mientras resuelve y
   **desaparece**, no queda latiendo.
7. **Los dos temas.**

---

## §7 · Primer paso recomendado

Fase 1 sola, y verificarla en device antes de tocar nada más. Es tres líneas menos de código y es
el arreglo del bug: si la hipótesis de §2.0 es correcta se ve de inmediato, y si no lo es, conviene
descubrirlo con el diff más chico posible sobre la mesa.

---

## §8 · Truncar + popover al mantener oprimido

> **Estado:** implementado, 239 tests verdes + typecheck limpio. **Falta `expo prebuild` +
> `expo run:ios` (los corre el usuario) y toda la verificación en device.**
> Referencia pedida por el usuario: `rit3zh/expo-ios-popover`, clonado en
> `/Users/ismartz/Desktop/DEV/expo-ios-popover`.

Los textos de las píldoras crecían sin límite. Ahora se cortan a **210pt** con `…`, y **mantener
oprimida** una píldora cortada revela el texto completo en un popover arriba.

### 8.1 · Por qué hay DOS implementaciones

`expo-ios-popover` es **100% iOS**: su `expo-module.config.json` declara `"platforms": ["apple"]`,
no trae carpeta `android/`, y por dentro usa `UIPopoverPresentationController` de UIKit —
reparentando la vista en un `UIViewController` presentado como popover
(`ExpoiOSPopoverModuleView.swift:78-100`). No hay equivalente en Android.

Se le preguntó al usuario y **eligió instalarlo igual** (`expo-ios-popover@0.1.5`, publicado en
npm). Consecuencia asumida: Android necesita su propio camino en JS, porque quedarse con píldoras
truncadas y sin forma de leerlas sería peor que no truncar.

| Plataforma | Quién gobierna el gesto |
|---|---|
| iOS | el módulo nativo (`Popover.Trigger` envuelve la píldora). `PillButton` **no** recibe `onHoldReveal` |
| Android / web | `PillButton` con su `Pressable` de siempre (`onLongPress`, 280ms) |

**Nunca conviven dos dueños del gesto sobre el mismo elemento**, y esa es la mitigación de un riesgo
real: el módulo cuelga un `UILongPressGestureRecognizer` de UIKit sobre el `Trigger`
(`ExpoiOSPopoverModuleView.swift:48-68`) **sin `cancelsTouchesInView = false`**, y React Native no
usa `UIGestureRecognizer` por vista sino su propio sistema de responder. Envolver un `Pressable` que
ya tiene su tap-to-send puede competirle el gesto — sólo se comprueba en simulador.

> **Dato del ejemplo de la referencia**, que conviene tener a mano si el tap corto falla: ellos
> ponen el pressable **por fuera** de `Popover.Root` (`TouchableOpacity > Popover.Root >
> Popover.Trigger > View`), no adentro del `Trigger` como acá. Si el tap se rompe en device, ESA es
> la primera alternativa a probar.

### 8.2 · Archivos

| Archivo | Qué es |
|---|---|
| `components/ui/pill-hold-popover.tsx` | el orquestador por plataforma (nuevo) |
| `components/ui/android-hold-popover.tsx` | el bubble JS + flecha SVG, calcado de `info-tooltip.tsx` (nuevo) |
| `components/ui/use-is-truncated.tsx` | la medición-fantasma + `exceedsWidth` puro (nuevo) |
| `components/ui/pill-button.tsx` | + `maxWidth`, `onHoldReveal`, `onHoldRelease` |
| `features/aispace/components/quick-actions.tsx` | usa `PillWithHoldPopover` |

### 8.3 · Lo que se descubrió por el camino

**`Pressability` de React Native ya suprime `onPress` tras un long-press.** Verificado en la fuente
(`Pressability.js:749-752`, `isPressCanceledByLongPress`). Iba a escribir un guard manual por
reflejo — habría sido código muerto. Soltar el dedo tras sostener no envía el mensaje, gratis.

**`onLayout` de react-native-web NO se puede medir bajo jsdom, y no es culpa del harness.** Se
resuelve por `UIManager.measure`, que lee `node.offsetWidth` (`UIManager/index.js:17-19`) — no
`getBoundingClientRect`, que es lo único que `src/test/setup.ts` falsea. En jsdom `offsetWidth` es
siempre 0. Por eso la detección de truncado vive en su propio módulo: los componentes lo **mockean**
en vez de fingir que miden, y la comparación pura (`exceedsWidth`) sí se prueba de verdad.

**El long-press tampoco se puede simular con `fireEvent`.** Su temporizador vive en el sistema de
responder LEGADO de react-native-web (`useResponderEvents/ResponderSystem.js`), que escucha eventos
**nativos del `document`**, no props sintéticas de React. Probado en vivo con `mouseDown` y con
`pointerDown` + avanzar timers: no dispara. Nadie en el repo lo había ejercitado (0 tests de
`onLongPress` existían, ni para el único long-press previo). Por eso `pill-button-hold.test.tsx`
verifica el **cableado** (qué props recibe el `Pressable`) y no el gesto — y lo dice por escrito.

**Un bug de accesibilidad real, destapado por un test que falló.** El texto-fantasma que mide el
ancho duplicaba cada etiqueta en el árbol: un lector de pantalla la leería **dos veces**. Ocho tests
empezaron a fallar con *"Found multiple elements"*. La respuesta correcta no era parchear esos ocho
tests, sino marcar el fantasma `aria-hidden` (el arreglo de verdad) y enseñarle al harness a
respetarlo — `configure({ defaultIgnore: 'script, style, [aria-hidden="true"]' })` en `setup.ts`.
Ahora una consulta por texto ignora lo que el usuario no puede percibir, que es lo que siempre
debió hacer. Verificado por mutación: quitar el `aria-hidden` pone 5 tests en rojo.

### 8.3b · El recuadro rojo, y el guard que salió de él

Al recargar el JS nuevo sobre el dev-client **viejo**, el carrusel se llenó de recuadros rojos:

```
Unimplemented component: <ViewManagerAdapter_ExpoiOSPopoverModule>
```

Significa que el módulo nativo **no está en el binario**. Misma familia que el
`ViewManagerAdapter_ClerkAuthView` que documenta `cuadra-clerk`: JS nuevo + binario viejo. El
arreglo inmediato es `expo prebuild` + `expo run:ios`.

**Pero el síntoma expuso un modo de fallo que no debía existir.** Cualquier binario sin el módulo
—un dev-client desactualizado, un build al que no se le corrió prebuild— convertía TODAS las
píldoras en recuadros rojos. Un carrusel roto es mucho peor que un carrusel sin popover.

Ahora `resolveHoldStrategy()` decide entre `none` / `native` / `js`, y el camino nativo exige que
`requireOptionalNativeModule("ExpoiOSPopoverModule")` no sea `null`. Sin módulo → cae al popover JS,
que funciona en cualquier binario.

> **Y una lección de método:** el primer test de este guard **pasó sin implementar nada**. Bajo
> jsdom `Platform.OS` es siempre `"web"`, así que la rama iOS es inalcanzable y el test pasaba por
> la razón equivocada — exactamente lo que advierte `cuadra-api` («un guard que nunca viste fallar
> no es un guard»). Por eso la decisión se extrajo a una función PURA: las cuatro combinaciones se
> prueban de verdad, y la mutación lo confirma.

### 8.3c · Ajustes tras la primera prueba en device

El popover funcionó. Lo que siguió fueron correcciones visuales pedidas mirando el iPhone:

| Pedido | Qué cambió |
|---|---|
| «que ocupen dos líneas, si supera ahí sí muestra los `…`» | `maxWidth` (1 línea) se partió en **`maxWidth` + `maxLines`**: uno decide dónde envuelve, el otro cuántas veces |
| «el ancho debe ser fit» | el tope se movió del TEXTO a la PÍLDORA + `flexShrink: 1` en el texto |
| «centraliza los textos de las pill» y del popover | `textAlign: "center"` dentro de `PILL_LABEL_STYLE`, heredado por los tres |
| «el nombre del producto arriba con el shimmer» | encabezado nuevo `ResolvedProductHeader` |
| «colócalo en el centro» / «colócale semibold» | `alignItems: "center"` + `fontWeight="600"` |

**Tres decisiones de fondo que salieron de esos ajustes:**

**El `lineHeight` pasó a ser explícito.** Sin él RN deriva el alto de línea de las métricas de la
fuente, distinto por plataforma — y entonces «¿el texto pasa de 2 líneas?» deja de tener respuesta
calculable. Con 18 fijo, dos líneas son exactamente 36pt. Vive en `PILL_LABEL_STYLE`, exportado,
porque la medición del truncado tiene que usar el MISMO estilo o la medida miente.

**La detección pasó de medir ancho a medir alto.** Antes: «¿el texto es más ancho que el tope?».
Ahora: con el ancho ya restringido el texto envuelve solo, así que «cuánto mide de alto» ES
«cuántas líneas ocupa». `exceedsWidth` → `exceedsLines`, con media línea de tolerancia (el alto
medido nunca cae exacto en `lineHeight × n`).

**La geometría se derivó y se mudó.** `PILL_HEIGHT = lineHeight × maxLines + padding × 2` vive en
`pill-hold-popover` —el que decide cuántas líneas— y `quick-actions` la importa para el esqueleto.
Con las constantes sueltas en dos archivos, subir el tope de líneas dejaba la píldora corta y el
texto se recortaba por la CAJA en vez de por el `…`: un recorte sin puntos suspensivos y sin gesto
para leer el resto. Falla silenciosa, ahora con test.

> **Un hueco que sólo apareció mutando.** El test de geometría pasaba aunque la medición usara el
> ancho de la píldora en vez del que le queda al texto (240 vs 208) — el mock de `useIsTruncated`
> lo tapaba. Con el ancho equivocado entra una línea de más y el `…` aparece tarde. Se agregó
> `"measures truncation against the width left to the TEXT"`, verificado por mutación.

### 8.4 · Verificación en device (pendiente, del usuario)

```bash
npx expo prebuild        # ios/ y android/ están gitignoreados (CNG): se regeneran, no se versionan
npx expo run:ios         # módulo nativo nuevo → Expo Go NO sirve
```

1. **El experimento que valida el riesgo de §8.1**: mantener oprimido abre el popover **y** un tap
   corto sigue enviando el mensaje. Si (b) falla → probar el anidamiento de la referencia.
2. Una píldora larga se corta con `…`; una corta **no** ofrece el gesto.
3. iOS: el popover aparece arriba, con flecha, en ambos temas.
4. **Android**: el popover JS — es el camino que ningún trabajo previo ejercitó.
5. Soltar cierra el popover **sin** enviar el mensaje.
