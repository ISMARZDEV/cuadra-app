# Chat de Cuadra — carrusel de "Sugerencias Populares"

> **Estado:** plan aprobado, sin implementar. Escrito el 2026-08-09.
> **Origen:** user story con criterios de aceptación + mockup (encabezado verde, píldoras oscuras
> translúcidas en fila con la última cortada).
> **Punto de partida:** `developer` @ `3a40a46` · rama `feat/chat-suggestions-carousel`
> **Cambio post-implementación:** el usuario pidió sacar el encabezado "Sugerencias Populares ⭐"
> — la fila de píldoras se explica sola. Las secciones §2.3 y las menciones al título abajo quedan
> como registro de la decisión original; el componente ya NO lo renderiza.

---

## §0 · Rol y protocolo

**Typecheck verde y tests verdes NO dicen que la UI funcione.** Todo lo de este plan es visual y de
movimiento: se valida viéndolo en el render real, en AMBOS temas, o no está validado. Protocolo
`cuadra-ui-verify` — el agente es el loop de QA, nunca el usuario.

TDD estricto: RED antes que GREEN en cada fase que toque código con comportamiento.

No commitear ni pushear salvo que el usuario lo pida explícitamente en el turno.

---

## §1 · Qué falta, medido

**La mitad ya existe.** `QuickActions`
(`apps/mobile/src/features/aispace/components/quick-actions.tsx`) ya renderiza 4 prompts
localizados dentro del `ChatDock`, y ya envía en el acto: `chat-screen.tsx:832-838` llama
`sendAndAnchor(prompt)` y cierra el dock. **El criterio §3 del story (envío automático, sin pasar
por la caja de texto) está cumplido hoy.**

Lo que falta es lo demás:

| Criterio del story | Cuadra hoy | Brecha |
|---|---|---|
| Encabezado "Sugerencias Populares ⭐" | no existe | **descartado a pedido del usuario, ver nota arriba** |
| Píldora oscura/translúcida + borde sutil (HIG) | lima sólida `#D9F5C2`, sin borde | rediseño → reusar `PillButton` |
| Scroll horizontal | rejilla 2×2 (`flex-wrap` + `width: 48%`) | **todo** |
| Overflow peek (última cortada) | no aplica (rejilla) | **todo** |
| Envío automático al tocar | ✅ ya funciona | — |
| Estado pressed (feedback táctil/visual) | `Pressable` pelado, sin feedback | **todo** |
| Prevención de doble clic | ninguna | **todo** |
| Teclado en estado pasivo | no declarado | `keyboardShouldPersistTaps` |

### Dónde vive esto

El mockup muestra el guion verde del `ChatDock` justo encima del título: la superficie es el dock
colapsable que hay **sobre el input**, no el estado vacío del chat.

```
chat-screen.tsx
└── bottom zone (GlassSurface translúcido)
    ├── ChatDock (handle Minus verde · abre/cierra con resorte)
    │   └── chat.interaction ? DockInteractionView : manualOpen ? QuickActions : null   ← ACÁ
    └── ChatInputBar
```

`ChatEmptyState` (la rejilla 2×2 de widgets del chat vacío) **no se toca**: es otra historia, con
su propio plan en `docs/sdd/chat-home-widgets.md`.

---

## §2 · Decisiones tomadas ANTES de escribir código

### 2.1 · Ocho sugerencias, no cuatro

El *overflow peek* pide que sobren sugerencias. Con 4 el desbordamiento existe pero el swipe se
agota en un gesto. Se amplía a 8: las 4 actuales + 4 nuevas, en es/en/pt.

### 2.2 · La píldora es `PillButton`, no una paleta nueva

**Decisión del usuario, y es la correcta.** El docstring de `components/ui/pill-button.tsx:8-11`
lo dice por escrito:

> *"Nació del contador de mensajes gratis del chat (Figma 675:16944) y se extrajo aquí porque el
> patrón se repite: una acción secundaria que necesita más peso que un texto y menos que un botón
> sólido. **El caso del chat pasa a ser UN USO de este componente, no el componente.**"*

Este carrusel es exactamente ese segundo uso. Y en tema oscuro `PillButton` ya es
`rgba(21,21,21,0.20)` con canto en degradado — literalmente el *"fondo oscuro/translúcido con un
borde sutil"* que pide el story. Definir una paleta paralela a mano habría duplicado el lenguaje
visual del proyecto para conseguir lo que el componente compartido ya daba.

**Pero el carrusel NO usa la paleta de marca.** Ocho píldoras lima seguidas gritan por encima de
la conversación. `PillButton` gana una prop `variant`, no un juego de props de color sueltas: abrir
`bg`/`text`/`edge` al llamador habría convertido cada uso en un tema propio, que es exactamente lo
que un sistema de diseño existe para impedir.

| | `brand` (input, sin tocar) | `surface` (carrusel) |
|---|---|---|
| fondo oscuro | `rgba(21,21,21,0.20)` plano | **degradado** `#0A0A0C → #1F1F22` |
| texto oscuro | `#C2FB7E` | `#FFFFFF` |
| canto oscuro | `#525252 → #1C1C1C` | `#7A7A7F → #3A3A3E` |
| fondo claro | `#C2FB7E` plano | degradado `#F1F1F3 → #FFFFFF` |
| texto claro | `#034842` | `#034842` |
| canto claro | `#96DF3F → #C2FB7E` | `#D6D6DC → #EAEAEF` (**rampa invertida**) |

**La rampa del canto se invierte con el tema, no es el mismo par aclarado.** En oscuro el canto es
LUZ: brilla en los extremos —donde la curva encara la fuente— y se apaga en el centro plano. En
claro el canto es SOMBRA, así que el orden se da vuelta: más profundo en los extremos, casi nada en
el centro. Heredar la rampa oscura tal cual dejaba una banda gris cruzando la mitad de la píldora
que se leía como suciedad.

El degradado del relleno va **vertical, de oscuro arriba a claro abajo**: la píldora se lee como una
superficie curvada que recoge el rebote de la luz en su borde inferior, no como una tarjeta
iluminada de frente.

### La opacidad del fondo

`fillOpacity` (0-1) controla cuánto deja pasar el relleno. Se expone como la constante
`PILL_FILL_OPACITY` en `quick-actions.tsx` — un único número para calibrar cuánto se ve el chat
por detrás del carrusel.

Sólo afecta al **relleno**: texto y canto quedan a plena opacidad a propósito. Bajarlos también
volvería la píldora ilegible en vez de translúcida.

**La trampa, y es de las que no avisan:** el degradado vive en el `<Svg>`, que sólo se dibuja tras
el primer `onLayout`, así que debajo hay SIEMPRE un color plano de base. Si ese color se quedara
opaco, taparía por abajo exactamente lo que el degradado deja pasar por arriba y la prop no haría
nada visible. El alfa viaja a los dos (`withAlpha()`), y hay un test que lo fija.

`brand` **ignora** la prop: su fondo ya es translúcido por definición y tiene que seguir dejando
pasar el glass del input tal cual.

Dos detalles que el fondo en degradado obliga:

- **El degradado se dibuja en el `<Svg>` que ya existía para el canto**, con un id `-fill` aparte.
  `expo-linear-gradient` está descartado en este repo (su vista nativa no queda enlazada de forma
  fiable en el dev-build; misma razón documentada en `glass-button.tsx`).
- **El `<Svg>` sólo se dibuja tras el primer `onLayout`** (necesita medidas reales), así que la
  píldora conserva un `backgroundColor` plano de base: sin él habría un frame transparente.
- `fill` es `null` en `brand` **a propósito**: su fondo oscuro es TRANSLÚCIDO y tiene que seguir
  dejando pasar el glass del input. Pintarle un Rect opaco encima lo mataría.

### 2.3 · Título en Kantumruy, no en fuente del sistema

El mockup se ve en SF Pro, pero `chat-typography.ts:29-30` documenta el alcance **explícitamente**:

> *"⚠️ ALCANCE: sólo MENSAJES + COMPOSER. Las tarjetas (producto, canasta, **quick-actions**, dock,
> estado vacío) quedan FUERA por decisión explícita — tienen su propia escala y su Kantumruy."*

La fuente del sistema en el chat es una excepción para **prosa larga**, no para etiquetas de UI. Un
encabezado de sección es etiqueta. Se respeta la regla escrita.

Color del título: `#C2FB7E` oscuro / `#034842` claro — el mismo par que el handle del dock
(`chat-dock.tsx:29`), que es lo que se ve en el mockup.

### 2.4 · El componente NO se renombra

Las claves i18n ya son `chat.quickActions.*`. Renombrar a `PopularSuggestions` arrastra
`interfaces.ts`, `chat-screen.tsx`, el test y los 3 JSON sin ganar nada semántico: siguen siendo
las acciones rápidas del dock. El título "Sugerencias Populares" entra como una clave más del
namespace existente.

---

## §3 · Fases, ordenadas por riesgo ascendente

### Fase 1 — `PillButton` aprende a responder al toque (riesgo bajo)

`apps/mobile/src/components/ui/pill-button.tsx`

**El feedback tiene que ir DENTRO del componente, no envolviéndolo.** No es preferencia de estilo:
`PillButton` renderiza su propio `Pressable`, así que un `AnimatedPressable` por fuera **nunca
recibiría el toque** — el `Pressable` interno lo captura primero y el de afuera no dispara. Envolver
es un callejón sin salida en RN.

Cambios, todos **gateados a que exista `onPress`**:

```tsx
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const scale = useSharedValue(1);

onPressIn  → scale.value = withSpring(0.96, { damping: 18, stiffness: 400, mass: 0.7 })
onPressOut → scale.value = withSpring(1,    { damping: 12, stiffness: 260, mass: 0.8 })
onPress    → void Haptics.impactAsync(Light)  ANTES de llamar al handler
```

Configs copiadas de `basket-product-card.tsx:83-85` (el press de **tarjeta**, no el de botón chico:
el `0.86` de `PressFx` sería exagerado en una píldora ancha). La háptica va **antes** del handler
por la regla de la casa, documentada en ese mismo archivo: el dedo tiene que sentir la respuesta en
el mismo frame, no después de que el estado se resuelva.

Se agrega además `paddingHorizontal?: number` (default `10`, el actual): ese `10` es para un
contador de 5 caracteres; una frase larga necesita ~16.

**Riesgo de regresión: cero, verificado.** `PillButton` tiene HOY **un solo llamador** —
`FreeMessagesButton` en `chat-input-bar.tsx:126` — y ese **no pasa `onPress`** ("sin acción
todavía"). Con el gate, su render no cambia en nada.

**Dos invariantes del archivo que NO hay que romper** (ya resueltas, se conservan):

- El `gid` del degradado usa `useId()` por instancia → 8 píldoras = 8 ids únicos. Dos `<Svg>` con
  el mismo id en `<Defs>` colisionan (comentario línea 46-47). **Este es el motivo técnico de peso
  para reusar el componente y no copiar su markup.**
- El radio nunca puede superar `height/2`, o RN recorta los extremos en elipse (comentario línea
  19-20; le pasó a este mismo botón con el `24.586` que venía de Figma sobre una caja de 36pt). Con
  `height={44}` → `radius={22}`.

**Por qué el `scale` no rompe el canto en SVG:** el trazo se dibuja tras el primer `onLayout` con
medidas reales, y en RN un `transform: scale` es **post-layout** — no vuelve a disparar `onLayout`,
así que el stroke no se re-mide ni parpadea. No aplica aquí la prohibición de `cuadra-glass-button`
sobre escalar ancestros de `GlassView`: esto es un `Pressable` + `Svg`, no hay glass nativo.

**Tests** (`pill-button.test.tsx` — archivo nuevo, hoy no tiene):

- renderiza label e icono
- con `onPress`: el tap lo llama y dispara la háptica **antes** del handler (se asierta el ORDEN)
- **sin `onPress`: no dispara háptica** ← el test que protege al contador de mensajes gratis
- `surface` escribe en blanco sobre oscuro
- **`brand` es el default y conserva su lima** ← el test que impide que el input se contagie
- `brand` conserva su verde oscuro en claro
- **`fillOpacity` llega también al color plano de base** ← el test de la trampa de arriba
- `brand` ignora `fillOpacity`

Para los tres últimos hay que **sustituir el mock global de `nativewind`**: `src/test/setup.ts`
clava `colorScheme: "light"` para toda la suite, así que hasta ahora el tema oscuro no era
observable en ningún test. Se reemplaza por uno mutable vía `vi.hoisted`.

> Verificado por mutación: cambiar el hex esperado hace fallar el test. Una aserción de color que
> pasa pase lo que pase es peor que no tenerla.

### Fase 2 — i18n: 5 claves nuevas por idioma (riesgo nulo)

`apps/mobile/src/i18n/{es,en,pt}.json`, junto a las existentes (líneas 57-62), estilo plano de
clave punteada:

```json
"chat.quickActions.title": "Sugerencias Populares ⭐",
"chat.quickActions.budgetStatus": "¿Cómo va mi presupuesto 🎯?",
"chat.quickActions.biggestExpense": "¿En qué gasto más 📊?",
"chat.quickActions.compareProduct": "Compara precios de un producto 🔍🏷️",
"chat.quickActions.savingTip": "Dame un consejo para ahorrar 💡🐖"
```

| clave | en | pt |
|---|---|---|
| `title` | Popular Suggestions ⭐ | Sugestões Populares ⭐ |
| `budgetStatus` | How's my budget doing 🎯? | Como está meu orçamento 🎯? |
| `biggestExpense` | What do I spend most on 📊? | No que eu mais gasto 📊? |
| `compareProduct` | Compare prices for a product 🔍🏷️ | Compare preços de um produto 🔍🏷️ |
| `savingTip` | Give me a tip to save 💡🐖 | Me dê uma dica para economizar 💡🐖 |

Orden final del array, siguiendo el mockup:

```
spentThisMonth · registerIncome · availableMoney · shoppingList
budgetStatus · biggestExpense · compareProduct · savingTip
```

### Fase 3 — El carrusel (riesgo medio: es lo único que cambia de layout)

`apps/mobile/src/features/aispace/components/quick-actions.tsx`

**RED primero** — ampliar `quick-actions.test.tsx` (plantilla ya fijada en el archivo:
`@testing-library/react`, `fireEvent.click`, `beforeEach(() => setLanguage("es"))`):

- `renders the eight localized suggestions` (amplía el actual de 4)
- `tapping a suggestion sends its prompt` (el existente, intacto)
- **`a double tap sends the prompt only once`** ← el que justifica el latch:
  ```
  vi.useFakeTimers()
  dos fireEvent.click seguidos → expect(onSelect).toHaveBeenCalledTimes(1)
  act(() => vi.advanceTimersByTime(700)); tercer click → toHaveBeenCalledTimes(2)
  ```

**Estructura — sin encabezado.** Se implementó primero con título (hermano de la lista, no
`ListHeaderComponent`, porque como header scrollearía junto con las píldoras) y se sacó después a
pedido del usuario: la fila de píldoras se explica sola. Queda un `<View>` envolviendo sólo la
`FlatList`.

**Carrusel** — patrón de la casa, de `dock-interaction-view.tsx:110-140`:

```tsx
<FlatList
  horizontal
  showsHorizontalScrollIndicator={false}
  keyboardShouldPersistTaps="handled"
  data={QUICK_ACTION_KEYS}
  keyExtractor={(key) => key}
  ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
  contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
  nestedScrollEnabled
/>
```

Dos desvíos deliberados del patrón, cada uno con su motivo:

- **Sin `getItemLayout`**: las píldoras tienen ancho intrínseco variable. Los carruseles de producto
  sí lo pasan porque su `CARD_WIDTH` es constante; pasarlo con anchos falsos rompe el scroll.
- **Sin `removeClippedSubviews`**: son 8 ítems baratos, y desmontar/remontar una píldora re-dispara
  su `onLayout` → un frame sin canto. No vale el ahorro.

Cada ítem:

```tsx
<PillButton
  variant="surface"
  fillOpacity={PILL_FILL_OPACITY}
  label={t(key)}
  height={44}
  radius={22}
  paddingHorizontal={16}
  onPress={() => handleSelect(t(key))}
/>
```

Sin `icon`: los emoji ya viajan **dentro** del texto de la sugerencia, tal como pide el story.

**El peek es emergente, no forzado.** Ancho natural por píldora; con 8 prompts largos el contenido
desborda siempre, y la última visible queda cortada por el `cardClip` (radius 48) de la tarjeta del
chat — `chat-screen.tsx:614`. No hay que calcular un ancho parcial a mano.

**Latch anti doble-toque** — `useRef<boolean>`, **no** `useState`:

```tsx
if (lockRef.current) return;
lockRef.current = true;
onSelect(label);
timerRef.current = setTimeout(() => { lockRef.current = false; }, 600);
```

El ref es la respuesta correcta, no una cuestión de gusto: un `disabled` por estado se aplica en el
**commit** de React, y RN puede entregar dos `onPress` en el mismo frame — el segundo toque llega
antes de que el re-render haya deshabilitado nada. El ref latchea **síncrono**. El componente sigue
montado durante toda la ventana (el `ChatDock` mantiene los hijos montados hasta que el resorte de
cierre asienta, `chat-dock.tsx:50-51`), así que el latch cubre justo el hueco peligroso.
`clearTimeout` en el cleanup del `useEffect`.

**Teclado**: `keyboardShouldPersistTaps="handled"` en la lista hace que el toque llegue a la píldora
en vez de que lo trague el dismiss del teclado. Pero eso **NO alcanza** como gestión de foco — ver
§3.1, que es la corrección de este plan.

### Fase 3.1 — Teclado y carrusel, MUTUAMENTE EXCLUYENTES (el bug que costó la lección)

`apps/mobile/src/features/aispace/chat-screen.tsx`

El plan original decía que `keyboardShouldPersistTaps` era «toda la gestión de foco necesaria» y
descartaba `Keyboard.dismiss()` por miedo a alterar la coreografía de anclaje. **Era el error.** El
user story pedía explícitamente *«mantener oculto o en estado pasivo el teclado mientras el usuario
interactúa con el carrusel»*, y esa línea no era cosmética: era el requisito que evita un bug real.

**Síntoma:** enviar una sugerencia **con el teclado abierto** dejaba el mensaje MUY por encima de
`anchorOffset`, detrás del header, con un vacío enorme debajo. Escribiendo normal, o tocando la
misma sugerencia con el teclado cerrado, funcionaba perfecto.

**Causa.** `scrollMessageToEnd` (de `@legendapp/list/keyboard`) **no scrollea al mensaje**:

```js
freeze.set(true);
const dismissPromise = closeKeyboard && KeyboardController.dismiss();
const scrollPromise = listRefCurrent.scrollToEnd({ animated });
await Promise.all([scrollPromise, dismissPromise]);
```

Hace `scrollToEnd` y **confía** en que `anchoredEndSpace` haya reservado el blanco exacto para que
el final del contenido deje el mensaje a `anchorOffset` del tope. Esa reserva se calcula contra el
alto del viewport **y** el `paddingBottom` (`8 + bottomZoneH`). Enviando desde una sugerencia con el
teclado abierto, **tres geometrías se movían a la vez**:

1. el teclado cerrándose → la tarjeta crece ~235pt (nuestro `marginBottom` animado),
2. el dock colapsando → `bottomZoneH` cae de golpe ~60pt cuando `ChatDock` desmonta el cuerpo al
   asentar el resorte (`chat-dock.tsx:50-51`),
3. el propio `scrollToEnd`.

Desde el input sólo compiten (1) y (3) — la combinación que ya estaba depurada. Con el teclado
cerrado sólo compiten (2) y (3) — la que el usuario confirmó que funciona.

**Arreglo: que la combinación mala no exista.** El teclado y el carrusel se excluyen, en las dos
direcciones:

- abrir el carrusel (`onToggle` del dock) → `Keyboard.dismiss()`
- el teclado apareciendo (listener `KB_SHOW`) → `setManualOpen(false)`

No se toca la geometría del anclaje: se elimina el estado que la rompía.

**Test**: `chat-screen.test.tsx` → *"closing the keyboard is part of opening the suggestions
carousel"*, verificado por mutación. Existe para que nadie borre el `Keyboard.dismiss()` por
parecer decorativo. La otra mitad vive en un listener nativo que jsdom no dispara.

---

## §4 · Lo que este plan NO toca

- `ChatEmptyState` — la rejilla 2×2 de widgets del chat vacío (otra historia).
- `DockInteractionView` — las píldoras del flujo HITL tienen su propia paleta invertida y su propio
  contrato (`DockOption`); no comparten estilo con las sugerencias por diseño.
- El backend: las sugerencias siguen siendo **estáticas desde i18n**. Sugerencias dinámicas o
  contextuales son una fase posterior, ya anotada como TODO en el archivo actual.
- `chat-screen.tsx` — el cableado (`sendAndAnchor` + `setManualOpen(false)`) ya es el correcto.
- El contador de mensajes gratis del input: hereda la capacidad de animarse, pero **no la usa**
  (no pasa `onPress`).

---

## §5 · Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| Tocar `PillButton` rompe el input | Un solo llamador, sin `onPress`; el feedback va gateado. Test explícito de "sin `onPress` no hay háptica". |
| El canto SVG parpadea al escalar | `transform` es post-layout, no re-dispara `onLayout`. Verificar en vídeo, no por captura fija. |
| Radio elíptico en los extremos | `radius = height/2` exacto (22 sobre 44). Ya documentado en el archivo. |
| 8 `<Svg>` con ids colisionando | Resuelto de fábrica: `useId()` por instancia. Motivo para reusar y no copiar. |
| La última píldora no se ve cortada | Es emergente del ancho del contenido; si con 8 no desborda en el dispositivo más ancho, subir a 10 en vez de forzar anchos. |

### Lo que NO se puede testear con vitest, y hay que decirlo en voz alta

**La horizontalidad y el peek.** jsdom no hace layout: `src/test/setup.ts` clava
`getBoundingClientRect` a un rect fijo de 390×800. El único precedente en el repo
(`insights-carousel.test.tsx`) es un smoke "no explota", sin aserciones de scroll. Esos criterios
se verifican **visualmente**, no con tests.

Nota aparte: **los vitest de mobile no gatean CI** — `.github/workflows/ci.yml` (job `mobile`)
sólo corre `typecheck`. Los tests hay que correrlos a mano.

---

## §6 · Verificación

**Automática:**

```bash
pnpm --filter @cuadra/mobile test -- src/components/ui/pill-button.test.tsx
pnpm --filter @cuadra/mobile test -- src/features/aispace/components/quick-actions.test.tsx
pnpm --filter @cuadra/mobile test        # suite completa, sin regresiones
pnpm --filter @cuadra/mobile typecheck
```

**Visual — obligatoria antes de decir "listo"** (protocolo `cuadra-ui-verify`). En simulador o
iPhone, abriendo el dock con el handle verde:

1. El swipe horizontal recorre las 8; la última visible queda **cortada**, no completa.
2. La píldora es visualmente **la misma FAMILIA** que el contador de mensajes gratis del input
   (canto en degradado), pero en su variante `surface`: fondo negro en degradado, letra blanca.
3. Un toque → el mensaje aparece en el chat y el dock se cierra; el texto **nunca** pasa por el
   input.
4. Doble toque rápido → **un solo** mensaje.
5. La píldora reacciona al `pressIn` **antes** de ejecutar.
6. **Los dos temas** — capturas de oscuro y claro. En claro, verificar el canto (rampa invertida:
   sombra en los extremos, no en el centro) y que el contador del input **no cambió**.

---

## §7 · Primer paso recomendado

Fase 1 (`PillButton`) en RED→GREEN, y verificar en el simulador que el contador de mensajes gratis
del input sigue **idéntico** antes de seguir. Es el único cambio de este plan que toca código
compartido; si algo va a romperse, se rompe ahí y conviene que se rompa solo.
