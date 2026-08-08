# Chat de Cuadra — experiencia tipo ChatGPT

> **Estado:** Fase 1 implementada, pendiente de tu verificación visual (ambos temas) y de decidir
> si se commitea. Fase 0 (medir en vídeo) se omitió a pedido tuyo — la verificación la hacés vos
> directamente en el simulador, no por captura del agente. Escrito el 2026-08-08.
> **Fuentes:** [blog de Margelo](https://margelo.com/blog/building-native-llm-chat-app-with-rag) ·
> demo local en `/Users/ismartz/Desktop/DEV/ai-chat-demo/app`
> **Punto de partida:** `developer` @ `7f18747` (input rediseñado, ya mergeado)

---

## §0 · Rol y protocolo

Al cerrar CADA fase: **verificar con capturas del render real en AMBOS temas**, reportar, y
**PREGUNTAR si commitear**. No encadenar fases sin confirmación.

Regla que este documento hereda de la sesión que lo escribió, y que aquí importa más que nunca:
**typecheck verde y tests verdes NO dicen que la UI funcione.** Durante el rediseño del input ambos
estuvieron verdes mientras la pantalla lanzaba `Render Error`. Todo lo de este plan es visual y de
movimiento: se valida viéndolo, o no está validado.

---

## §1 · Qué falta, medido

Lo que hoy tiene el chat de Cuadra (`features/aispace/chat-screen.tsx`) frente a lo que el demo hace:

| Pieza | Cuadra hoy | Demo / ChatGPT | Brecha |
|---|---|---|---|
| Lista de mensajes | `ScrollView` | `LegendList` v3 + `KeyboardAwareLegendList` | **Sin virtualizar** y sin anclaje |
| Posición tras enviar | scroll al final | el mensaje enviado **sube al tope** y la respuesta fluye debajo | **La que pediste** |
| Texto del agente | texto plano + streaming propio | `react-native-enriched-markdown` (md4c nativo) | Sin markdown |
| Estado "pensando" | `typing-indicator` | **shimmer Skia** sobre el texto "Thinking" | Sin shimmer |
| Estado de herramienta (RAG) | **nada** | fila con icono + resumen, expandible a bottom-sheet | **Todo** |
| Entrada del mensaje | sin animación | `SlideInDown` + fade del indicador con 450 ms de retardo | Sin animación |
| Teclado | manual | `react-native-keyboard-controller` (`KeyboardStickyView`) | Sin librería |

### Dependencias

Ya en Cuadra: **Skia 2.6.2** · **Reanimated 4.3.1**.

Faltan: `@legendapp/list` · `react-native-enriched-markdown` · `react-native-keyboard-controller` ·
`@lodev09/react-native-true-sheet` (solo si se hace el sheet de razonamiento).

> ⚠️ ~~**Cada una es un módulo NATIVO**~~ — **corregido el 2026-08-08, verificado con `npm pack`**:
> **`@legendapp/list` (3.3.3) es JAVASCRIPT PURO.** Su tarball no trae `.podspec`, ni `ios/`, ni
> `android/`, ni plugin de Expo; su única dependencia es `use-sync-external-store` y `react-native`
> es peer **opcional**. **La Fase 4 no necesita recompilar nada.** Sólo el subpath
> `@legendapp/list/keyboard` (el `KeyboardAwareLegendList` del demo) importa
> `react-native-keyboard-controller` — o sea, la variante consciente del teclado depende de la Fase
> 3, pero el ANCLAJE en sí no.
>
> Las otras tres sí son nativas y exigen `expo prebuild` + rebuild del dev-client. Y hay precedente
> en este repo — instalar `@clerk/expo` sin `prebuild --clean` rompía `pod install`. Ver
> `cuadra-clerk`. **No instalar las tres de golpe**: una por fase, verificando entre medias.
>
> **`/ios/` y `/android/` están gitignoreados** (CNG): se generan, no se versionan. Regenerarlos con
> `prebuild` es el flujo normal, no una operación destructiva.

Compatibilidad verificada contra lo que corre el repo (Expo `~56.0.13` · RN `0.85.3` · React
`19.2.3` · Reanimated `4.3.1` · worklets `0.8.3`):

| Paquete | Versión | ¿Nativo? | Peers exigidos | ¿Los cumplimos? |
|---|---|---|---|---|
| `@legendapp/list` | 3.3.3 | **NO** | `react` | ✅ |
| `react-native-keyboard-controller` | 1.22.3 | sí | reanimated `>=3` | ✅ (4.3.1) |
| `react-native-enriched-markdown` | 0.7.4 | sí | `@expo/config-plugins >=50`, `katex` — **ambos opcionales** | ✅ |
| `@lodev09/react-native-true-sheet` | 3.11.9 | sí | reanimated `>=4`, `react-native-worklets`, **`@react-navigation/core >=7`**, **2 de Radix** | ⚠️ arrastra deps que hoy no están |

---

## §2 · Decisiones que hay que tomar ANTES de escribir código

Ninguna es técnica; las cuatro son de producto y no las decide el agente.

1. **¿Markdown en las respuestas?** Añade `react-native-enriched-markdown` (nativo). Si el
   `GroceriesAgent` ya responde en texto plano estructurado, quizá no haga falta todavía.
2. **¿Qué estados de herramienta se muestran?** El backend ya emite `ui_action` (ver
   `cuadra-save` / los flujos del `GroceriesAgent`). Hay que decidir **qué se le enseña al usuario**:
   ¿"Buscando en el súper…"? ¿con qué icono? ¿se puede expandir?
3. **¿Traza de razonamiento expandible?** Es la pieza más cara (bottom-sheet + otra dependencia
   nativa). Se puede dejar fuera de la primera entrega.
4. **¿Migrar la lista a `LegendList`?** Es el cambio de mayor riesgo: `chat-screen.tsx` tiene hoy
   una máscara de degradado sobre el `ScrollView`, el dock, el orbe y el input anclado. Todo eso
   hay que reubicarlo.
5. **De las seis acciones del mensaje (§7.3), ¿cuáles entran ya?** Copiar es local y no depende de
   nada. Compartir usa la hoja nativa. Pero **leer en voz alta necesita TTS**, y **pulgar
   arriba/abajo necesitan un endpoint de feedback que hoy no existe**. Mostrar botones que no hacen
   nada es peor que no mostrarlos.

---

## §3 · Fases, ordenadas por RIESGO ASCENDENTE

Cada fase es entregable por separado y deja la app funcionando.

### Fase 0 — Medir (sin código)

Capturar en vídeo el chat actual: envío, llegada de respuesta, scroll, teclado. Sin una referencia
del "antes" no hay forma de afirmar que el "después" mejora. Anotar aquí los tiempos observados.

### Fase 1 — Animación de entrada del mensaje (riesgo bajo) ✅ implementada

Solo Reanimated, **ya instalado**. Cero dependencias nuevas.

⚠️ **Corrección sobre el código de ejemplo original de este documento**: `entering={SlideInDown...}`
**no se usó** — el skill `cuadra-mobile` (§6) documenta que las animaciones `entering`/`layout` de
Reanimated no disparan de forma fiable en la New Architecture de esta app. Se implementó con el
mismo patrón que ya usan `streaming-text.tsx` y `typing-indicator.tsx`: `useSharedValue` +
`useAnimatedStyle` + `withTiming`, disparado en un `useEffect` al montar.

- `components/user-bubble.tsx`: la burbuja del usuario sube 36px + hace fade-in con
  `withSpring({ damping: 16, stiffness: 170, mass: 0.6 })` — el mismo spring que ya usa
  `chat-empty-state.tsx` para la entrada de sus widgets, en vez de un `withTiming` de duración
  fija (se sentía más mecánico; ajustado a pedido tuyo tras probar la primera versión). Solo el
  mensaje recién montado anima (React reutiliza los anteriores por key), igual que el resto del
  chat.
- `components/typing-indicator.tsx`: el flanco de aparición (`visible` false→true) ahora espera
  **450ms** (`ENTER_DELAY_MS`) antes de animar entrada — así el "pensando" llega justo después de
  que la burbuja terminó de subir, en vez de aparecer los dos a la vez. El flanco de desaparición
  sigue siendo instantáneo. Si `visible` vuelve a `false` antes de que el delay termine (respuesta
  rápida), el `cleanup` del `useEffect` cancela el timeout y el indicador nunca llega a mostrarse.

**Verificado:** `tsc --noEmit` limpio + 135/135 tests mobile verdes (incluye 3 tests nuevos sobre
el retardo del indicador). **Falta lo que este documento pide como cierre de fase real**: tu
verificación visual en el simulador, ambos temas, antes de commitear.

### Fase 2 — Shimmer de "pensando" con Skia (riesgo bajo) ✅ implementada

Skia **ya está** (`orb-sphere.tsx` es precedente vivo). Una banda de degradado horizontal barriendo
los glifos, con `useClock` en el hilo de UI.

Implementado calcando la técnica del post de Margelo y de su demo (`ShimmerText.tsx`): el texto se
dibuja DENTRO de un `<Canvas>` de Skia y sus glifos se rellenan con un degradado horizontal
tenue → brillante → tenue cuyo `start`/`end` caminan sobre la línea. `useClock` (shared value que
tiquea cada frame en el hilo de UI) + `useDerivedValue`:

```ts
const startX = useDerivedValue(() => -band + ((clock.value % periodMs) / periodMs) * travel);
```

**No** se usó `MaskedView` + overlay animado: eso compone una segunda vista sobre el texto cada
frame del lado de Fabric. Rellenar el paint de los propios glifos es una sola llamada de dibujo y
no re-hace layout nunca.

- `components/shimmer-text.tsx` (nuevo): el barrido. Carga **Kantumruy Medium** vía `useFont` sobre
  el mismo módulo `.ttf` que consume `app/_layout.tsx` (Skia no lee las familias registradas por
  RN), así la etiqueta queda métricamente idéntica al texto del chat. Mide con `getMetrics()` /
  `measureText()`: Skia posiciona por BASELINE, no por caja.
- `components/typing-indicator.tsx`: dejó de ser tres puntos. Ahora es **icono + etiqueta que
  brilla**, con tres estados (`ChatStatus` en `enums.ts`):

  | Estado | Icono lucide | Relleno |
  |---|---|---|
  | Pensando… | `Sparkles` | **sí, `fill`** |
  | Razonando… | `MessageSquareText` | no |
  | Buscando… | `Search` (la lupa) | no |
  | Validando… | `Telescope` | no |
  | Analizando… | `PackageSearch` | no |

  Etiquetas en es/en/pt (`chat.status.*`), todas terminadas en `…` — el trabajo sigue.

#### La coreografía: lo que se MUESTRA no es el estado crudo del backend

`use-status-sequence.ts` (nuevo) convierte la señal en una secuencia. Es **presentación, no señal**:
el backend sólo sabe «arrancó una tool» (un frame `status`), no en qué punto va por dentro, así que
inventar ese detalle en el backend sería mentir sobre un dato que no tiene. En el cliente es
honesto: es una animación de progreso, y se lee como tal.

- **Con búsqueda** → avanza `Buscando… → Validando… → Analizando…` y **se queda en el último**.
  Volver al primero se leería como retroceder, y el trabajo no retrocede. No arranca en «Pensando…»
  porque el usuario ya lo vio en la fase previa a la tool: repetirlo sería un paso perdido.
- **Sin búsqueda** → «Pensando…» y «Razonando…» dicen lo MISMO (es la misma espera con dos
  palabras), así que se alternan indefinidamente **arrancando por una al azar**, para que dos turnos
  seguidos no se vean calcados.
- Los timers se **congelan** cuando el indicador no está en pantalla — nada corriendo detrás de una
  línea que nadie ve (la misma lección del orbe, un escalón más arriba).

`Validating` y `Analyzing` son valores de `ChatStatus` que **nunca llegan del cable**: sólo existen
como pasos de la secuencia. El backend sigue emitiendo exactamente tres.

#### El eje correcto (decidido tras un primer intento equivocado)

El mapa del backend arrancó partido en «busca» vs «computa» — `basket_for_budget`, `monthly_cost` y
`worth_second_store` caían en `REASONING` y se llevaban el vaivén genérico. **Estaba mal, y se
cambió**: las tres corren la progresión.

El eje no es qué clase de trabajo hace la tool, es **qué le toca ver al usuario mientras espera**:

- **hay una tool corriendo** → trabajo real con fases → la progresión, que promete AVANCE
- **no hay tool** (el modelo decide qué hacer) → el vaivén, que es un latido de «sigo acá»

Dos razones para que TODA tool de datos se gane la progresión, incluso las rápidas:

1. **La secuencia se autolimita por duración.** El indicador desaparece con el primer token y cada
   paso dura ~1.4s: una tool de 400ms sólo alcanza a mostrar «Buscando…», una de 5s recorre el
   camino entero. Nunca se ve un paso que la espera no pagó — así que asignarla de más no cuesta
   nada, y el único lugar donde RINDE son justamente las tools lentas.
2. **Para la canasta las tres palabras son literalmente ciertas.** `BudgetBasket.execute` hace
   exactamente eso, en ese orden: `list_basket_offers` BUSCA qué producto de cada proveedor cubre
   cada rubro · `plan_basket` VALIDA qué entra en el presupuesto · el orden por cobertura +
   `is_cheapest` ANALIZA y compara entre tiendas. Describen su trabajo mejor que el de
   `search_groceries`, que es una sola query.

`register_transaction` sigue sin mapear: no busca nada, prepara una escritura por confirmar.

Consecuencia: **el backend ya no emite `reasoning`**. El cliente pinta «Razonando…» y «Pensando…»
como la misma espera con dos palabras, así que distinguirlos en el backend era una distinción que no
discriminaba nada. El valor se conserva en el protocolo para que los dos lados acepten el mismo
juego, pero ninguna tool lo produce.

⚠️ **Aplicar la lección del orbe**: `useFrameCallback`/`useClock` deben **desactivarse cuando el
indicador no está visible**. El orbe construía cuatro paths por frame en todas las pantallas hasta
que se le puso guarda (`7f18747`). No repetir el patrón.
→ Aquí la guarda es el **desmontaje**: `TypingIndicator` devuelve `null` cuando no está visible, así
que el reloj existe exactamente mientras el shimmer está en pantalla. Está documentado en el
archivo: si alguna vez se monta permanentemente y se oculta por opacidad, necesita la guarda del orbe.

✅ **La señal que enciende los tres estados — IMPLEMENTADA (backend + móvil).**
El protocolo SSE no tenía frame de estado, así que los tres estados existían sin nada que los
encendiera. Ahora sí:

- **Backend** — nuevo frame `{"type": "status", "value": "searching"}`. La señal sale del **mismo
  stream que ya se consumía**: cuando el modelo decide llamar una tool, su chunk trae
  `tool_call_chunks` con el NOMBRE — y `content` vacío, que es exactamente por lo que el filtro de
  tokens los descartaba enteros. La señal ya estaba en el cable; nadie la leía.
  - `orchestration/status.py` (nuevo): mapa tool → estado. La distinción NO es rápida/lenta, es qué
    pasa de verdad — `SEARCHING` va a buscar algo que no tiene (`search_groceries`,
    `compare_prices`, `explore_alternatives`, `cheapest_store_by_category`, `get_monthly_summary`,
    `get_safe_to_spend`); `REASONING` ya tiene los datos y decide sobre ellos (`basket_for_budget`,
    `monthly_cost`, `worth_second_store`). `register_transaction` queda SIN mapear a propósito: es
    staging de una escritura por confirmar, y anunciar «Buscando» ahí sería mentir.
  - Una tool sin entrada en el mapa cae a `thinking` — el estado genérico y verdadero. Por eso un
    mapa central acá **no** es el antipatrón que `ui_action_frames` evita: allá un `type`
    desconocido rompía el switch del cliente (despacho obligatorio); acá es enriquecimiento
    opcional y una tool nueva funciona sin tocar el archivo.
  - No se repite el frame si el estado no cambió (una tool-call llega fragmentada, y dos búsquedas
    seguidas son un solo estado para quien mira la pantalla), y se emite SIEMPRE antes del primer
    token: si llegara después, el cliente ya ocultó el indicador.
- **Móvil** — `ChatStatusEvent` en el union del wire, `use-chat` expone `status`, el chat se lo pasa
  al indicador. El `value` se tipa como `string`, NO como `ChatStatus`: viene de la red, y un
  backend que crezca un cuarto estado no puede romper el cliente — se mapea defensivamente y lo
  desconocido se ignora (degrada a «Pensando», que siempre es verdad).

Tests: 8 unitarios nuevos en `test_sse.py` + 4 en `use-chat.test.tsx`. El guard de que el
clasificador no filtre su propia tool-call **se rompió a propósito para verlo fallar** antes de
darlo por bueno (pasaba vacuamente en RED, porque aún no existía ningún frame `status`).

**Bug colateral corregido:** `components/ui/icon.tsx` declaraba `fill` en `IconProps` pero **nunca
lo reenviaba** al icono de lucide — pasarlo no hacía nada, en silencio. Sin arreglar eso, el
sparkles relleno era imposible. Ningún call site lo pasaba hoy, así que el arreglo no cambia nada
existente.

### Fase 3 — Teclado con `react-native-keyboard-controller` (riesgo medio)

Primera dependencia nativa → `prebuild` + rebuild del dev-client.

`KeyboardStickyView` para el composer. **Ojo:** el input ya vive en una zona absoluta sobre el
scroll, con el dock y el orbe; hay que comprobar que no se pelee con el anclaje actual.

**Verificación:** abrir/cerrar teclado en dispositivo FÍSICO. El simulador miente con el teclado.

### Fase 4 — `LegendList` (✅ migrada) + anclaje (⏳ espera la Fase 3)

**Estado real, y hay que decirlo con precisión porque el matiz importa:**

- ✅ **La lista está migrada** a `LegendList` y funciona **sin recompilar nada** (`@legendapp/list`
  es JS puro). Virtualiza, y `maintainScrollAtEnd` + `maintainScrollAtEndThreshold={1}` reemplazan
  el auto-follow manual (`nearBottomRef` + `followIfAtBottom`), que se borró.
- ⏳ **El anclaje NO está**, y no por olvido. Lo produce el prop `anchoredEndSpace`, y los tipos lo
  **omiten explícitamente** del `LegendList` normal: sólo lo acepta `KeyboardAwareLegendList`
  (`@legendapp/list/keyboard`), que importa `react-native-keyboard-controller` — nativo. **Llega con
  la Fase 3.** (Corrige una afirmación anterior de este documento: era cierto que el paquete es JS
  puro, pero NO que el anclaje viniera gratis con él.)
- Se decidió **no aproximarlo** con `scrollToIndex`: sin el espacio de cola sólo funcionaría cuando
  ya hay contenido debajo, así que el mismo gesto se comportaría distinto según el largo de la
  conversación. Un anclaje inconsistente se siente peor que no tenerlo.

**Lo que la migración destapó — dos cosas que ningún typecheck iba a decir:**

1. **`extraData={isStreaming}` es OBLIGATORIO.** Una lista virtualizada MEMOIZA sus filas, así que
   un cambio que sólo vive en el closure de `renderItem` no llega solo: al terminar el stream, la
   fila de acciones **no aparecía** hasta que algo más forzara un re-render. Con el `ScrollView` el
   problema no existía porque todas las filas se remontaban en cada render. Lo atrapó el test de
   pantalla, y se verificó rompiéndolo a propósito.
2. **El harness de tests no podía ver una lista virtualizada.** jsdom no calcula geometría:
   `getBoundingClientRect` devuelve ceros y el `ResizeObserver` era un no-op, así que la lista creía
   que su viewport medía 0 y **no renderizaba ni una fila** — o sea, migrar a virtualización
   equivalía a perder la cobertura de toda la pantalla. `src/test/setup.ts` ahora declara un
   viewport de teléfono coherente y dispara el observer. Beneficia a cualquier test futuro sobre
   listas.

**Red de seguridad creada ANTES de migrar**: `chat-screen.test.tsx` (5 tests de caracterización).
No existía ninguno — ver §5.3. Pasó verde con el `ScrollView`, y es lo que validó la migración.

---

#### Referencia original de la fase

Es **lo que pediste**: el mensaje enviado sube al tope y la respuesta fluye debajo.

```ts
setAnchorIndex(messagesLength);                                  // anclar el que se va a añadir
scrollMessageToEnd({ animated: !isFirstMessage, closeKeyboard: true });
```

`anchoredEndSpace` inserta espacio en blanco por debajo del mensaje anclado cuando el contenido no
llena el viewport; cuando llega a cero, se pasa a scroll "sigue-el-final" y la respuesta va montada
en la cola.

**Lo que hay que reubicar al migrar desde `ScrollView`:**
- La máscara de degradado que hoy va **delante** del scroll (`chat-screen.tsx:77`)
- El `paddingBottom` dinámico que reserva la altura de la zona inferior
- El dock, el orbe y el input anclado

**Verificación:** primer mensaje de una conversación vacía · mensaje con la lista ya llena ·
respuesta larga que desborda · respuesta corta que no llena el viewport.

### Fase 5 — Estados de herramienta / RAG (riesgo medio) — ✅ la parte no expandible YA ESTÁ

Fila con icono + resumen mientras el agente busca. Era: «el backend ya emite `ui_action`; falta el
contrato de qué estados se muestran y cómo se etiquetan».

**Ese contrato se cerró en la Fase 2** (frame `status` + `orchestration/status.py`): la fila con
icono + etiqueta existe, se enciende sola cuando el agente llama una tool, y dice cuál de las tres
cosas está haciendo. Lo que queda de esta fase es **solo la versión expandible** (el bottom-sheet),
que sigue siendo opcional y depende de §2.3 — y §2.3 hoy **no tiene de dónde sacar los datos**, ver
§8.

### Fase 6 — Markdown nativo (opcional, ver §2.1)

`react-native-enriched-markdown`, `flavor="github"`, con `streamingAnimation` atado al estado del
mensaje. Sustituye al `streaming-text.tsx` actual — que tiene tests, así que hay que migrarlos.

---

### Fase 7 — La burbuja del agente: tipografía, selección y acciones

Tres cambios sobre el mensaje del agente. Independientes entre sí y **sin dependencias nuevas**, así
que pueden ir antes que las fases pesadas.

#### 7.1 · Tipografía del SISTEMA, no Kantumruy — ✅ implementada

El texto del chat deja de usar `KANTUMRUY_*` y pasa a la **fuente del sistema** — SF Pro en iOS,
Roboto en Android. Se consigue **omitiendo `fontFamily`**, no nombrándola: RN cae a la del sistema, y
además hereda el tamaño dinámico de accesibilidad, que una fuente empaquetada no da.

**Por qué, y por qué solo aquí:** el texto de un chat es prosa larga que se lee en bloque, no
etiquetas de UI. La fuente del sistema está optimizada para eso, es la que el usuario ya lee en
todo el teléfono, y es lo que hace que ChatGPT "se sienta nativo". **El resto de la app sigue con
Kantumruy** — esto es una excepción deliberada, no un cambio de marca.

Alcance: burbuja del agente, burbuja del usuario y el `TextInput` del composer. **No** los botones,
la píldora ni el resto de la UI.

**Cómo quedó** — `chat-typography.ts` (nuevo) expone `CHAT_BODY` (peso 500) y `CHAT_STRONG` (600),
objetos de estilo **sin `fontFamily`**. Migrados: `user-bubble`, `agent-message` (sus 7 nodos de
texto), `streaming-text`, el `TextInput` de `chat-input-bar` y `shimmer-text`. Verificado que las
tarjetas y los botones (`product-card`, `basket-card`, `quick-actions`, `chat-empty-state`,
`dock-interaction-view`) **conservan** Kantumruy: el alcance es exactamente el que fija el plan.

Dos cosas que el plan no anticipaba:

- **El peso tuvo que pasar a `fontWeight`.** No basta con quitar `fontFamily`: las clases del
  proyecto (`font-sans-medium`…) llevaban la cara Y el peso juntos, así que quitarlas también
  perdía el peso medio que se había pedido a propósito. Con la fuente del sistema `fontWeight` SÍ
  resuelve — con Kantumruy no podía, porque cada peso es un TTF aparte y RN no elige archivo por
  número (ese es el motivo del comentario en `tailwind.config.js`).
- **El shimmer tuvo que seguirla.** Si la línea de estado se quedaba en Kantumruy, desentonaba con
  el texto que la rodea. Pasó de `useFont(<ttf>)` a `matchFont({fontSize, fontWeight})`: omitir
  `fontFamily` en Skia también da la del sistema, porque su default es literalmente `"System"` y su
  FontMgr lo resuelve a la cara nativa. Como `matchFont` nunca devuelve null, se eliminaron de paso
  las guardas de «mientras carga la fuente», que habían quedado mintiendo.

#### 7.2 · Texto seleccionable — ✅ YA ESTABA HECHO

> ~~Hoy no se puede seleccionar ni copiar.~~ **Falso al escribirlo o desde entonces**: verificado por
> grep, las cuatro superficies de texto ya llevaban `selectable` — `user-bubble`, los cuatro nodos
> de `agent-message` y cada palabra de `streaming-text`.

Queda **una** limitación real, documentada en el propio `streaming-text.tsx`: como cada palabra es
su propio `<Text>` (lo exige el fade por palabra), la selección nativa se limita a UNA palabra por
gesto — no se puede arrastrar para seleccionar un párrafo. Eso sí sigue abierto, y no se arregla
sin renunciar al fade o sin el markdown nativo de la Fase 6.

⚠️ **Comprobar la interacción con el scroll y con los gestos del dock**: un texto seleccionable
captura el long-press, y este chat ya tiene gestos encima (el swipe del orbe, el dock). Es
exactamente el tipo de conflicto que costó taps de más en el input.
⚠️ Si se adopta `react-native-enriched-markdown` (Fase 6), verificar que su render nativo respete
`selectable` — no darlo por hecho.

#### 7.3 · Fila de acciones bajo la respuesta del agente — ✅ las dos que funcionan

Aparece **solo en mensajes de la IA** y **solo cuando el streaming ha terminado**. Iconos de
**lucide** (el único set del proyecto, ver `cuadra-mobile`):

| Acción | Icono lucide | Notas |
|---|---|---|
| Copiar | `Copy` | al portapapeles + confirmación breve |
| Compartir | `Share` | hoja nativa de compartir |
| Leer en voz alta | `Play` | ¿TTS? **decisión de producto, ver §2.5** |
| Me gusta | `ThumbsUp` | necesita endpoint de feedback |
| No me gusta | `ThumbsDown` | idem |
| Regenerar | `RotateCw` | reenvía el turno anterior |

**Implementadas DOS: copiar y compartir** (`components/message-actions.tsx`). Las otras cuatro NO se
muestran, aplicando la propia regla de este documento — un botón que no hace nada es peor que no
mostrarlo. Los pulgares necesitan un endpoint de feedback que no existe, regenerar necesita rebobinar
el checkpoint del grafo, y el TTS sigue siendo decisión de producto (§8).

- **Aparecen sólo bajo una respuesta TERMINADA**: `showActions = i < messages.length - 1 ||
  !isStreaming`. Con el texto todavía creciendo, la fila empujaría el layout en cada token — y
  ofrecería copiar media respuesta.
- **Confirmación de copiado sin infraestructura**: el icono `Copy` se convierte en `Check` durante
  1.6s. El portapapeles es invisible; sin eso no hay forma de saber si el toque registró. Nada de
  toasts, y el layout no se mueve.
- **Peso visual**: en el mismo gris apagado que la línea de estado, `strokeWidth` 1.8, nunca en verde
  de marca — con color compiten con el texto que acompañan.

⚠️ **Deuda conocida y aislada**: copiar usa el `Clipboard` del core de RN, que **está deprecado**
(«will be removed in a future release»); el reemplazo correcto es `expo-clipboard`, que es módulo
NATIVO y exige `prebuild` + rebuild. Se eligió el de core para no bloquear la fila tras una
recompilación, y toda la superficie vive en **un solo archivo** (`lib/clipboard.ts`): migrar es
cambiar ese archivo y nada más. `Share` sí es del core y no está deprecado.

## §8 · Auditoría: qué le falta al plan DEL BACKEND

Verificado contra el código el 2026-08-08, no asumido. El plan decía en §4 «este plan no toca el
backend — el contrato de `ui_action` ya existe». **Eso era incorrecto**: tres piezas del plan
necesitan backend que hoy no existe, y una ya se hizo.

| Pieza del plan | ¿Backend? | Estado |
|---|---|---|
| §2.2 estados de herramienta | frame `status` | ✅ **hecho** (Fase 2) |
| §2.3 traza de razonamiento expandible | contenido de razonamiento | ❌ **no hay de dónde sacarlo** |
| §7.3 pulgar arriba / abajo | endpoint de feedback | ❌ **no existe** |
| §7.3 regenerar | rehacer el último turno | ❌ **no existe** |
| §7.3 copiar · compartir | — | ✅ locales, sin backend |
| §7.3 leer en voz alta | — | TTS del dispositivo, sin backend |
| Fases 1 · 3 · 4 · 6 · 7.1 · 7.2 | — | sin backend |

**§2.3 — la traza de razonamiento no tiene fuente de datos.** El demo la saca de los *reasoning
summaries* de OpenAI. Cuadra corre `gpt-4o-mini`/`gpt-4o` en dev y `claude-haiku-4-5`/
`claude-sonnet-4-6` en prod (`src/shared/llm/__init__.py`): **ninguno de esos emite una traza de
razonamiento por defecto**, y `grep -ri reasoning src/contexts/aispace` no devuelve nada fuera del
archivo de estados que acabo de escribir. Construir el bottom-sheet primero daría una hoja vacía.
Para tenerla haría falta *extended thinking* de Claude en el tier `smart` (por verificar cómo lo
superficia LangChain) — o aceptar que la traza NO es el razonamiento del modelo sino **el rastro de
tools** (qué se llamó, con qué argumentos, qué devolvió), que sí tenemos y es probablemente más útil
para el usuario: «busqué arroz → encontré 12 en 3 tiendas». Esa segunda opción es mucho más barata
y no depende del proveedor.

**§7.3 — no existe ningún endpoint de feedback.** `grep -rni "feedback\|thumbs\|rating" src/api
src/contexts` devuelve **vacío**. Los pulgares necesitan: tabla + entidad, use-case, endpoint, DTO,
y `make openapi`. No es un botón, es una vertical pequeña. Mientras no exista, el plan ya dice lo
correcto: **mostrar botones que no hacen nada es peor que no mostrarlos**.

**§7.3 — regenerar tampoco es gratis.** El grafo persiste por `thread_id` con checkpointer; volver a
mandar el mismo mensaje por `/chat/stream` **agrega un turno nuevo**, no reemplaza el anterior: el
hilo quedaría con la pregunta duplicada. Regenerar de verdad necesita rebobinar el checkpoint al
estado previo al último turno y re-ejecutar. Es la más cara de las seis acciones.

**Recomendación de orden**: copiar y compartir entran ya (locales, cero dependencias). Los pulgares
y regenerar salen de la primera entrega. La traza expandible: decidir primero si es *razonamiento*
o *rastro de tools* — son dos productos distintos con costos muy distintos.

---

## §4 · Lo que este plan NO toca

- ~~El backend y el `GroceriesAgent` — el contrato de `ui_action` ya existe~~ **Corregido: era
  falso.** Ver §8 — la señal de estado necesitó backend (ya hecho), y tres piezas más lo necesitan.
  El `GroceriesAgent` en sí sigue sin tocarse: la señal se saca del stream, no del agente
- El input rediseñado (`7f18747`), salvo el ajuste de teclado de la Fase 3
- `PillButton`, el cristal y el orbe
- La web

---

## §5 · Riesgos conocidos

1. **Cuatro dependencias nativas.** Una por fase, con rebuild y verificación entre medias.
2. **`chat-screen.tsx` es un archivo grande y cargado de casos límite** — la máscara, el dock, el
   orbe, el foco del input. Cada uno costó su iteración y está documentado en comentarios.
   **Leerlos antes de mover nada.**
3. ~~**Los tests actuales del chat pasan con `ScrollView`.** La Fase 4 los va a tocar~~ — **falso,
   verificado**: `grep -rln "ChatScreen" src --include="*.test.tsx"` no devuelve NADA. Los 14 tests
   del chat son de COMPONENTES; **ninguno monta `chat-screen.tsx`**. Y eso es peor noticia, no
   mejor: la fase más riesgosa del plan **no tiene una sola red de seguridad automatizada**. Nada se
   pondrá rojo si la migración rompe el scroll, el auto-follow o el anclaje del input. Antes de
   tocar el ScrollView conviene escribir el primer test que monte la pantalla.
4. **El demo usa Nitro** (websockets, fetch, decodificación nativa). **Fuera de alcance**: es una
   arquitectura distinta, no un componente.

---

## §6 · Primer paso recomendado

**Fase 0 + Fase 1.** Cero dependencias nuevas, resultado visible de inmediato, y deja medida la
línea base para juzgar todo lo que venga después.

Y antes de la Fase 4 —la grande— tomar las decisiones de §2, porque cambian qué se construye.
