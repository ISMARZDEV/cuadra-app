---
name: cuadra-motion
description: >
  Movimiento en la app Expo de Cuadra: la MECÁNICA de Reanimated 4 (qué se congela, qué viaja entre
  hilos y qué se lee tarde), cómo se coreografía una transición entre varias piezas, cómo se ANCLA
  algo que viaja, y cómo se TESTEA todo eso cuando el stub de pruebas hace los defectos invisibles.
  Cada regla salió de un defecto real y trae el síntoma por el que se reconoce.
  Trigger: construir o depurar CUALQUIER animación en `apps/mobile` — `useAnimatedStyle`,
  `useSharedValue`, `withTiming`/`withSpring`/`withDelay`, `useAnimatedScrollHandler`, worklets,
  transiciones entre pantallas, carruseles que se mueven solos, cascadas/escalonados. Dueña de DOS
  PATRONES COMPLETOS listos para reusar: «una pantalla que se REORGANIZA para dejarle sitio a un
  campo» y «una pantalla de DETALLE que se PLIEGA al hacer scroll» —la pieza grande de arriba se
  retira, la cabecera se compacta y el contenido aterriza bajo la curva—, con su geometría derivada,
  su imán nativo y sus tests en coordenadas de pantalla. Cargar también ante
  síntomas como «aparece en el sitio equivocado un fotograma», «salta al abrir/cerrar», «a veces sí
  y a veces no», «la primera vez falla y después va bien», «se mueve demasiado despacio/rápido»,
  «el control no responde al dedo mientras se anima», «undefined is not a function» en un worklet
  con los tests verdes, o «sube demasiado / se queda corto / quedó todo detrás del header».
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
---

> Compone con `cuadra-mobile` (estructura), `cuadra-design-system` (paleta), `cuadra-chat-input` y
> `cuadra-glass-button` (el MATERIAL de vidrio y sus gotchas), `cuadra-mobile-testing` (arnés) y
> `cuadra-ui-verify` (verificación visual, que esta skill NO sustituye).

## When to Use

- Vas a escribir o tocar un `useAnimatedStyle`, un `useSharedValue` o un worklet.
- Una animación se ve mal UN FOTOGRAMA y bien después.
- Un defecto es INTERMITENTE, o falla la primera vez y después no.
- Dos elementos tienen que moverse coordinados y se leen como sucesos separados.
- Algo que VIAJA (una píldora, una tarjeta) tiene que arrancar desde donde estaba otra cosa.
- Vas a escribir un test de movimiento.

## Critical Patterns

### 1. Las tres verdades de Reanimated que causan «el fotograma raro»

Verificadas en la FUENTE de `react-native-reanimated@4.3.1`, no de memoria. Si dudas, vuelve a leerla.

| Verdad | Dónde está | Consecuencia |
|---|---|---|
| `useAnimatedStyle` **congela el updater de su primera pasada** y no lo reasigna jamás | `hook/useAnimatedStyle.js` → `if (!animatedUpdaterData.current)` | El estilo con el que la vista NACE sale de ese updater viejo |
| El estilo de MONTAJE se calcula **ejecutando ese updater congelado** | `createAnimatedComponent/PropsFilter.js` → `initialUpdaterRun(handle.initial.updater)` bajo `_isFirstRender` | Lo que capturó la clausura llega al primer commit |
| Escribir un shared value **desde JS no escribe: ENCOLA** | `mutables.js` → `scheduleOnUI(() => { mutable.value = newValue })` | Ni en el cuerpo del render llega a tiempo para el montaje del mismo commit |

Y la asimetría que las une: **un worklet captura las variables JS por VALOR y los shared values por
REFERENCIA.** Si dentro de un mismo estilo animado una cosa se lee bien y otra no, mira cuál de las
dos es shared value — ésa es la firma del defecto.

### 2. ⭐ Un valor rancio multiplicado por cero es cero

La corrección no siempre es traer el valor a tiempo. Muchas veces es **redefinir la fórmula para que
el fotograma de montaje no lo necesite**:

```tsx
// MAL — en el montaje `lift` vale 0, así que translateY = travel… y travel llega rancio.
top: restY
transform: [{ translateY: (1 - lift.value) * travelValue.value }]

// BIEN — se MAQUETA en el origen y sube restando. En el montaje translateY = 0 * (lo que sea) = 0.
top: restY + travel                                    // número JS, maquetación, siempre fresco
transform: [{ translateY: -lift.value * travelValue.value }]
```

> **Si un fotograma de montaje depende de un valor que viaja entre hilos, multiplícalo por el reloj.**
> El estado de REPOSO queda en la maquetación; sólo el MOVIMIENTO consulta lo compartido.

Las dos mitades hacen falta: la maquetación fija el montaje, el shared value hace que la animación
lea el valor en vivo sin esperar a que el efecto de `useAnimatedStyle` se re-registre.

### 3. Cuándo se escribe en el cuerpo del render

No es «nunca mutar en el render». Es **sólo cuando el efecto llega TARDE**:

| Caso | Dónde | Por qué |
|---|---|---|
| Resetear relojes antes de reabrir | **cuerpo del render** | Un efecto corre DESPUÉS de pintar: la copia ya nació con el valor viejo |
| Refrescar un callback «último conocido» | **`useEffect` sin deps** | El primer temporizador salta a 1800ms; sobra tiempo, y en el render es impuro |

React Compiler no invalida mutar un shared value en el render (puede renunciar a memoizar, nunca
borra un efecto secundario), pero **mutar un `useRef` en el render sí lo delata `react-doctor`** —
y con razón: un render descartado ya habría escrito.

### 4. La vuelta de una transición se ordena desde EL TOQUE

Nunca desde el final de otra animación. Encadenar por callback de fin convierte un movimiento en una
COLA DE SUCESOS.

Síntoma: «la pantalla se queda un rato incompleta y luego llega el resto de golpe».

⚠️ Ojo con las banderas que parecen la misma y no lo son. En `home-screen`: `searchOpen` se apaga en
el toque; `searchActive`, cuando la copia aterriza (760ms después). La segunda es correcta SOLO para
esconder el original mientras dura el viaje; todo lo demás cuelga de la primera.

### 5. Un número duplicado con una nota que dice «acuérdate» YA se desincronizó

Los tiempos que dos archivos deben acordar van a un **módulo compartido** (`search-choreography.ts`),
no duplicados con un comentario. Probado: el comentario decía 320 donde el código usaba 520.

La regla de dependencias se respeta porque ninguno importa del otro: los dos leen de un tercero.

### 6. Anclar algo que VIAJA: derivar, no medir

`measureInWindow` **devuelve 0 en frío** (primer toque tras montar; también dentro de `onLayout`).
Si la posición se puede calcular, se calcula:

```ts
// search-anchor.ts — la píldora va justo debajo del header, en un ScrollView sin paddingTop.
homeSearchBarY = headerBlockHeight(width) - scrollY
```

> **Preguntarle al lado nativo algo que ya sabes calcular es cambiar una certeza por una carrera.**

Corolarios que costaron un defecto cada uno:
- **Un 0 de `measureInWindow` no es un dato: es un fallo disfrazado.** Se declara `undefined` y quien
  recibe deriva. Nunca se inventa una posición plausible ni se guarda «la última buena» (envejece:
  `onLayout` no se dispara al hacer scroll).
- ⭐ **Si un nodo se MIDE, tiene que ocupar la caja que representa.** Un `alignItems: "center"` que
  encoge al hijo convierte «dónde está la píldora» en «dónde está el icono» — 13pt de error. La
  medida no miente: mide fielmente otra cosa. Y de paso te quita área tocable.
- **Meter un envoltorio puede cambiar QUÉ representa un nodo medido**, aunque el conjunto no se mueva
  un píxel. Al añadir un wrapper, revisa los `ref` + `measureInWindow`.
- Un suelo tipo `MIN_TRAVEL` **no protege de nada**: si se activa, ESE es el glitch. La red buena es
  tener un valor real que poner.

### 7. Coreografía: escalonar sin temporizadores

⭐ **Un reloj compartido + una VENTANA por elemento.** Cada hijo interpola una franja distinta del
mismo `progress`:

```tsx
const t = interpolate(progress.value, [index * STEP, index * STEP + SPAN], [0, 1], CLAMP);
```

Doce estilos derivados de un reloj no son doce relojes: es una resta por fotograma en el hilo de UI.
**Y regala el orden inverso gratis**: al llevar el reloj de 1 a 0 las ventanas se cruzan al revés, así
que la escalera se deshace por donde se hizo. El orden vive en la GEOMETRÍA, no en dos listas de
retardos que habría que mantener sincronizadas.

#### 7a. ⭐⭐ Si el escalonado vive en las VENTANAS, el RELOJ tiene que ser LINEAL

Con `STEP` y `SPAN` en PROGRESO, el desfase que percibe el usuario está en MILISEGUNDOS — y entre los
dos hay una curva. Poner un *easing* en el reloj compartido **aplasta la escalera**: los escalones del
medio se amontonan y los de los extremos se separan.

Medido en el detalle de producto, con `Easing.bezier(0.2, 0, 0, 1)` sobre un reloj de 394 ms:

| | Diseñado | Real con la curva |
|---|---|---|
| Duración de un escalón | 134 ms (medidos) | **58 ms** |
| Desfase entre bloques | ~33 ms | **8-11 ms** (medio fotograma a 60 fps) |
| Fin de la cascada | 301 ms | **143 ms**, y 251 ms del reloj sin animar nada |

Se leía como «todo a la vez», que es justo lo que una cascada existe para no ser. **La curva de cada
escalón la pone su propia ventana; el reloj sólo cuenta tiempo.**

> La derivación `DURACIÓN = medido / SPAN` **sólo es válida con reloj lineal.** Si el reloj lleva
> curva, esa cuenta miente y ningún test que mida en PROGRESO lo notará.

⚠️ Esta regla estaba escrita en `search-overlay.tsx` desde el primer consumidor de `CascadeItem`, y
la pantalla siguiente la rompió igual. **Un aviso en un comentario no protege al código: hace falta
un test que mire la curva** (ver «Testear movimiento»).

#### 7b. Cuántos escalones caben — y por qué es un número, no una opinión

El último escalón termina en `(n-1) · STEP + SPAN`, y **eso tiene que ser ≤ 1** o ese bloque nunca
llega a opacidad plena: se queda a medio aparecer para siempre, y sólo se ve mirando muy fijo.

Con `STEP` 0.085 y `SPAN` 0.34 el techo son **ocho** bloques (el noveno acaba en 1.02). Añadir uno
más obliga a recortar `STEP` o `SPAN` — y eso cambia la cadencia MEDIDA, así que es una decisión, no
un ajuste. Ponle test con las DOS cotas: que `n` cabe y que `n+1` no.

Y cuando la cascada se reparte entre varios componentes, **el reparto de puestos vive en el módulo
del reloj**, nunca en cada componente: con el reparto repartido, dos bloques acaban compartiendo
índice, entran a la vez y NO se ve — se lee como que «ahí la cascada va rápida».

### 8. Afinar movimiento

- ⭐ **Un muelle se afina por ω₀ y ζ, no por duración.** `withSpring({damping, stiffness, mass})`.
- ⭐ **Si tocar un parámetro no mejora nada tras DOS intentos, ese parámetro no es la causa.** (La
  lentitud real eran doce `RiseIn` por fila, no la curva.)
- **`scrollTo({animated:true})` dura lo que decida iOS (~350ms) y NO se configura.** Subir el
  intervalo entre pasos para «ir más lento» sólo alarga la PAUSA: más lento en total y **más brusco**.
- ⭐ **Un carrusel de presentación no es un desplazamiento continuo: es una SECUENCIA DE LLEGADAS.**
  Lo que hace legible cada elemento no es lo despacio que viaje, sino el rato que se queda QUIETO al
  llegar. La pausa debe ser MAYOR que el deslizamiento.
- **Un número mágico que a veces acierta es peor que uno que siempre falla** (`STEPS = 3` alcanzaba el
  final con 10 categorías y no con 12): el destino se DERIVA de los datos, no se escribe. En la
  ruleta acabó siendo `VISIBLE_SLOTS` —cuántas caben a la vez—, así que un pantallazo dura lo mismo
  con 13 categorías que con 25.
- ⭐ **Acota la AMBICIÓN de una presentación automática, no sólo su ritmo.** Recorrer el catálogo
  entero costaba **12-18s** (30 con 25 categorías) y era demasiado tiempo con algo moviéndose solo:
  el usuario espera a que termine para poder mirar en paz, aunque se apague al primer toque. Un
  barrido dice «esto se desliza» — «dónde acaba» es OTRO objetivo, y perseguirlo ahí sale carísimo.

### 9. ⭐ Un control que no suelta el gesto está roto, por bonito que se mueva

Empujar `scrollTo` fotograma a fotograma contra una lista con `snapToInterval` pelea con el motor de
imantado: durante los ~13s del barrido el dedo no consigue hacerse con ella.

**La velocidad se resigna; el gesto no se negocia.** Y todo movimiento automático se apaga con la
PRIMERA señal de intención — arrastrar, tocar la banda **y elegir un elemento** (ese se olvida).

### 10. ⭐⭐ Una animación de ENTRADA pertenece a la LLEGADA, no al contenido

Tres defectos distintos, el mismo malentendido: creer que «entrar» es «montar». Los tres salieron de
la pantalla de detalle de producto y los tres estaban invisibles para 480 tests en verde.

**a) Si la pantalla no se desmonta, el efecto de montaje no vuelve a correr.**
`router.replace` sobre la MISMA ruta conserva el árbol y sólo cambia el parámetro. Un
`useEffect(..., [reloj])` no se entera nunca: el reloj se queda donde lo dejó —en 1, con todo
puesto— y el contenido nuevo aparece de golpe. **Medido: 3 fotogramas distintos en 1 s, los tres
dentro de 6 ms.**

**b) Se REMONTA con `key`; NO se reinicia el reloj a mano.**
Poner `reloj.value = 0` es lo obvio y es lo equivocado: escribir un shared value desde JS **encola**
(§1), así que queda un fotograma con el contenido nuevo pintado a opacidad PLENA y el reloj todavía
en 1 — un parpadeo, peor que no animar. Remontando, el reposo sale de la maquetación:
`useSharedValue(0)` nace en 0 y el updater congelado de la primera pasada ya lo lee así.

**c) La `key` lleva DOS causas independientes, y ninguna sustituye a la otra.**

| Causa | Ejemplo | Qué NO cubre |
|---|---|---|
| Cambió el CONTENIDO | saltar de un producto a otro por un raíl | no hay llegada nueva: nunca se sale de la pantalla |
| Cambió la LLEGADA | volver de otra pestaña, o de una subpantalla | no cambia el contenido |

La identidad del contenido sale de los **DATOS**, nunca del parámetro de ruta: el parámetro cambia
ANTES de que lleguen los datos nuevos, así que la animación correría sobre el contenido ANTERIOR
—que es lo que sigue en pantalla— y el nuevo entraría después sin animar.

Y el separador importa: con `id + visita` a secas, `canon-1` en la visita 2 y `canon-2` en la
visita 1 dan la misma cadena y una entrada se pierde en silencio. Usa algo que no aparezca ni en un
UUID ni en un slug (`${id}#${visita}`).

La visita se cuenta con `useFocusEffect`, **saltándose el PRIMER foco**: el primer foco ES el
montaje, y contarlo remontaría el dueño del reloj un fotograma después de nacer — la entrada se
vería reiniciarse a sí misma.

### 11. ⭐⭐ Con los datos en caché, la entrada compite con la transición de pantalla

El defecto más escurridizo de la serie, y el que explica «la primera vez sí y las demás no»:

- **Datos fríos**: la pantalla llega → «cargando» → el contenido monta ~220 ms después. La entrada
  corre sobre una pantalla **quieta** y se ve perfectamente.
- **Datos en caché** (o sea, SIEMPRE a partir de la segunda vez): el contenido monta en el **mismo
  commit** que la pantalla, y los ~400 ms de entrada se gastan **mientras la pantalla se desliza
  hacia dentro**. Al posarse ya está todo puesto: **animó donde nadie estaba mirando.**

> **La primera vez es la ANÓMALA, no las demás.** Si una entrada «sólo se ve la primera vez»,
> sospecha del caché antes que del reloj: lo que cambia no es la animación, es CUÁNDO monta.

El arreglo es retrasar el arranque hasta que la pantalla esté quieta. Dos avisos caros:

- ⚠️ **`navigation.addListener("transitionStart" | "transitionEnd")` NO llega** en esta pila.
  Comprobado subiendo el plazo de espera a 3 s: a 1,2 s de entrar la pantalla seguía VACÍA, lo que
  sólo puede pasar si el único disparador era el plazo. **Un evento que no llega no es una señal,
  es una espera.**
- ⚠️ El retraso se ancla a cuándo montó **la PANTALLA**, no el contenido: así los tres casos
  (caché, frío, volver de otra pestaña) salen de una sola resta sin preguntar por qué camino se
  entró. Ver `product/motion/arrival.ts`.

### 12. ⭐⭐⭐ El ORDEN DE DECLARACIÓN es una regla del lenguaje, en DOS sabores

Los dos comparten perfil de peligro: **typechecan, pasan todos los tests y revientan en el
dispositivo.** Ninguna puerta del repo los ve.

#### 12a. Un worklet NO puede llamar a otro declarado más abajo

**Síntoma: `Render Error — undefined is not a function` en el dispositivo, con TODOS los tests verdes
y el typecheck limpio.**

El plugin de Babel captura las funciones referenciadas EN EL MOMENTO de crear el worklet, así que
dentro de un worklet el hoisting normal de JS **no aplica**. El orden de declaración deja de ser
cosmético y pasa a ser una regla del lenguaje.

```ts
// ✗ REVIENTA en el dispositivo
export function galleryLift(y, d, shrink) { "worklet"; return -(y + shrink * headerCollapse(y, d)); }
export function headerCollapse(y, d)      { "worklet"; return windowProgress(y, d, SHELL); }

// ✓ Los llamados SIEMPRE antes que quien los llama
export function headerCollapse(y, d)      { "worklet"; ... }
export function galleryLift(y, d, shrink) { "worklet"; ... }
```

⚠️ **Ningún test normal puede verlo**: en el arnés `"worklet"` es una cadena inerte y el hoisting
funciona. 553 tests pasaron verdes mientras la app se caía al abrir la pantalla.

✅ **Ya hay guardia**: `motion/worklet-order.test.ts` lee el CÓDIGO FUENTE de la carpeta, extrae las
funciones por llaves balanceadas (no regex — los cuerpos llevan objetos anidados), y falla diciendo
qué mover. **Es portable**: cópialo a cualquier otra carpeta de worklets. Y si escribes uno nuevo,
pruébalo reintroduciendo el defecto a propósito — un guardia que no se comprueba no protege nada.

#### 12b. Un `useDerivedValue` no puede leer un `const` declarado DESPUÉS

**Síntoma: pantalla en blanco o crash en el PRIMER render.** `useDerivedValue` evalúa su función de
inmediato para calcular el valor inicial, así que un `const` que aún no existe es un **TDZ**.

```tsx
// ✗ TDZ: revienta en el primer render, y TypeScript no dice nada
const collapse = useDerivedValue(() => headerCollapse(scrollY.value, collapseDist));
const collapseDist = collapseDistance({ … });

// ✓ TODA la geometría ARRIBA del todo, antes de cualquier reloj
const collapseDist = collapseDistance({ … });
const collapse = useDerivedValue(() => headerCollapse(scrollY.value, collapseDist));
```

⚠️ **Los tests tampoco lo cazan** si nadie renderiza esa pantalla —y los tests de movimiento prueban
módulos PUROS, no pantallas—. **Regla práctica: en una pantalla con movimiento, la geometría se
calcula ARRIBA DEL TODO**, antes del primer `useSharedValue`/`useDerivedValue`.

## El PATRÓN: una pantalla que se REORGANIZA para dejarle sitio a un campo

El buscador de Supermarket, construido entero y depurado a lo largo de muchas rondas. **Reúsalo tal
cual** cuando un campo tenga que ocupar la pantalla desde donde estaba en reposo: buscar en otra
vertical, un filtro a pantalla completa, un compositor que se despliega.

Vive en `search-choreography.ts` (los tiempos), `search-anchor.ts` (de dónde sale),
`search/search-overlay.tsx` (la hoja) y `home-screen.tsx` (la pantalla anfitriona).

### La idea que lo sostiene

No es «aparece una hoja encima». Es **la pantalla se reorganiza**: lo pesado de arriba SE APARTA y
por eso el campo puede subir hasta ahí. Tapar ese sitio con un telón lo haría parecer ocupado
todavía, y el movimiento dejaría de tener causa.

### Dos actos, y el orden NO es negociable

```
ABRIR                                            CERRAR (desde EL TOQUE de la X)
t=0    las categorías salen una a una            t=0    el cuerpo se va (cascada, 240ms)
t=320  la elipse del header se retira (450ms)    t=200  el telón empieza a irse
t=520  ← STAGE: recién aquí arranca la hoja      t=200  la barra se ensancha (200ms)
       · el telón se llena (420ms)               t=380  la barra BAJA (380ms) — y el header
       · la barra SUBE (380ms) ← protagonista           vuelve CON ella, mismo arranque y
t=820  la barra se estrecha y sale la X (200ms)         misma duración
t=920  el cuerpo entra en cascada (620ms)        t=560  las categorías rebotan EN PLENO VUELO
                                                 t=760  barra y header aterrizan JUNTOS
```

- ⭐ **EL PRIMER ACTO ES DEL HEADER Y LA HOJA ESPERA.** `STAGE` (520) es lo que tarda la ÚLTIMA
  categoría en irse del todo. Con la barra arrancando en 0 subía con el verde y las categorías
  todavía puestas: tres cosas que no parecían tener nada que ver entre sí.
- ⭐ **NADA SE DIBUJA DONDE LA BARRA TODAVÍA ESTÁ.** El contenido se posiciona contra el sitio FINAL
  de la barra; mientras ella viaja, ese sitio está ocupado. Por eso la cascada espera a que el viaje
  vaya por sus tres cuartas partes. Sin esa espera se veía el título TOCANDO el campo.
- ⭐ **AL CERRAR, TODO CUELGA DEL TOQUE.** Cero callbacks de fin encadenados. Ver §4.
- **El telón se va CON la barra, no después.** Esperando a que aterrice, el fondo aguantaba sólido
  durante todo el descenso y se esfumaba de golpe: dos sucesos donde debe haber uno.
- **Las categorías vuelven a rebotar A MEDIA BAJADA de la elipse**, no cuando se posó: caen sobre
  ella en vuelo y llegan como UNA cosa.

### Los cuatro relojes, y por qué no basta uno

`sheet` (telón) · `lift` (el viaje, protagonista) · `squeeze` (ancho + entrada de la X) · `cascade`
(el cuerpo). Cada uno empieza cuando el anterior ya casi terminó, y **eso no se puede expresar con un
solo `progress` compartido**. No es sobreingeniería: es la única forma de tener solapes controlados.

- **El ancho sigue a `squeeze`, NO a `lift`.** Compartiendo reloj, la barra se estrechaba MIENTRAS
  subía: dos cosas a la vez que se leen como una sola cosa mal hecha. Separadas: sube → se asienta →
  se estrecha.
- **El ANCHO también viaja.** Abierta, la píldora cede sitio al botón de cerrar, así que es más
  estrecha que en reposo. Con ancho fijo, la copia aterrizaba corta y el original aparecía de golpe a
  ancho completo — un salto en el último fotograma, donde más se nota. Efecto secundario bienvenido:
  el botón no necesita animación propia, entra solo a medida que la barra le hace sitio.

### El RELEVO — la parte que hace creíble que sea el mismo objeto

Hay DOS píldoras: la de reposo y la copia que viaja. Si se ven las dos, el truco se cae.

| Señal | Cuándo | Para qué |
|---|---|---|
| `searchOpen` | se apaga **en el toque** | manda TODO el movimiento: header, ruleta, hoja |
| `searchActive` | se apaga **al aterrizar** (`onClosed`, 760ms) | esconde la píldora de reposo durante el viaje ENTERO |
| `onReturning` | se dispara **en el toque** | la pantalla de detrás REPITE su entrada |

- **La de reposo se esconde por OPACIDAD, no desmontando**: tiene que seguir ocupando su sitio o la
  pantalla salta.
- **La copia se pinta EN EL MISMO COMMIT del toque** (`if (!visible && !mounted) return null`, mirando
  `visible` además de `mounted`). Con sólo `mounted` —que se pone en un efecto— quedaban uno o dos
  fotogramas con un HUECO donde estaba la píldora.
- ⭐ **`onReturning` se dispara EN EL TOQUE, no a mitad del descenso.** Se probó avisando por la
  POSICIÓN (a dos tercios del viaje, luego a un tercio) y las dos veces se leyó tarde: **las dos
  animaciones DURAN, así que lanzarlas juntas es lo único que hace que terminen juntas.**

### Las curvas

`ENTER` y `LEAVE` son la MISMA — «emphasized» de M3 simétrica, `bezier(0.2, 0, 0, 1)`. El espejo
matemático de la de entrada llegaría a destino a máxima velocidad: un frenazo seco justo en el punto
que más se mira, el aterrizaje. **Lo que hace que el cierre se lea como «deshacer» no es la curva: es
que recorra EL MISMO CAMINO, entre los MISMOS extremos y en el MISMO tiempo.**

## El PATRÓN: una pantalla de DETALLE que se PLIEGA al hacer scroll

El detalle de producto de Supermarket. **Reúsalo tal cual** cuando una pantalla tenga una pieza
grande arriba (foto, portada, mapa) que deba retirarse al bajar dejando una cabecera compacta:
detalle de tarjeta, de préstamo, de comercio.

Vive en `product/motion/gallery-collapse.{ts,test.ts}` (TODOS los números),
`product/product-screen.tsx` (la geometría) y `components/curved-header.tsx` (la cáscara).

### La idea que lo sostiene

**Todo cuelga de UN `scrollY`.** No hay animación de entrada y otra de salida que puedan discrepar:
hay un número que sube y baja con el dedo. Por eso **la vuelta no hay que escribirla** —es el mismo
cálculo con otro valor— y el dedo puede pararse donde quiera: cada punto tiene su estado.

Y es aritmética PURA, sin `interpolate` de Reanimated: se puede probar sin dispositivo (el arnés
stubea `interpolate`, así que un test sobre él no probaría nada) y se puede llamar desde un worklet.

### ⚠️ La GEOMETRÍA es donde viven TODOS los defectos

**Cuatro entregas seguidas se rechazaron, y los tests de la FÓRMULA pasaron en las cuatro.** El
defecto nunca estuvo en la aritmética: estaba en dónde caían las cosas en la pantalla. Tres verdades,
una ronda cada una:

1. ⭐⭐⭐ **El `ScrollView` es HERMANO del header, no hijo.** Cuando el verde encoge, el techo del
   scroll SUBE con él y el contenido recibe ese desplazamiento GRATIS.
   **Cuánto VIAJA la pieza y cuánto SCROLL hace falta son DOS NÚMEROS DISTINTOS.** Confundirlos
   se pasa por exactamente lo que el header encoge (118pt aquí), y con imán ese exceso se aplica
   **de golpe al soltar**: el título termina enterrado detrás de la curva.
2. ⭐⭐⭐ **La panza de la curva CUELGA FUERA de la caja** (`position:absolute; bottom:-BULGE`).
   **La altura de `CurvedHeader` NO es dónde termina el verde.** Medir contra la caja se pasa 28pt.
3. ⭐⭐ **Lo que ocupa sitio en el flujo, cuenta.** Los puntos del carrusel, al moverse de dentro de
   la foto al hueco bajo ella, dejaron de flotar y pasaron a empujar al título.

```
D            = photoGap + photoHeight + dotsBand − belowRow − headerBulge − TITLE_CLEARANCE
headerShrink = headerRow + belowRow − HEADER_REST
```

⭐ **El área segura SE CANCELA sola** (entra en los dos lados de la resta), por eso la función no la
pide y nadie tiene que acordarse de ella.

### Los tramos, en FRACCIONES del recorrido — nunca en puntos

Escribir «a los 200pt» ata el plegado a un teléfono: generoso en un Pro Max, ahogado en un SE. En
fracciones la coreografía es la misma y sólo cambia cuánto dedo cuesta.

| Tramo | Fracción | Regla que lo sujeta |
|---|---|---|
| Flechas y puntos del carrusel | `0 → 0.08` | Gobiernan la pieza que se va: se apartan al PRIMER roce |
| Controles del header | `0.04 → 0.22` | Fuera antes de que la pieza llegue arriba — pero **no en 0** |
| Cáscara verde | `0.2 → 1` | Arranca DESPUÉS que la pieza, o todo se sacude a la vez |
| La FOTO | `0.45 → 0.92` | Aguanta entera mientras esté dentro de la pantalla |
| Tirador | `= fin de la foto → 1` | DERIVADO (`INDICATOR_REVEAL.from = PHOTO_FADE.to`), no un número suelto |

⭐ **El `0.04` de los controles del header no es ruido: es la diferencia entre dos familias.** Las
flechas y los puntos arrancan en **0** porque gobiernan la pieza que se está yendo —en cuanto el dedo
baja, dejaron de tener sentido—. Los controles del header **siguen en su sitio en el fotograma 2** de
la referencia, así que salir disparados con el primer punto de scroll los delataría como accionados
por un umbral en vez de por el gesto. Hay un test para cada uno.

⭐ **El tirador NO lleva número propio**: se declara `{ from: PHOTO_FADE.to, to: 1 }`. Alargar el
desvanecido de la foto lo recoloca solo, en vez de descuadrarlo — que fue justo lo que pasó la
primera vez que se estiró el tramo de la foto.

### Las cuatro reglas que costaron un rechazo cada una

- ⭐⭐⭐ **NO RECORTAR contra un canto inventado.** Se probó bajo la fila de botones y en el canto de
  la cabecera compacta: las dos veces la tarjeta apareció **AMPUTADA** —canto recto, esquinas
  cuadradas—. Sale por el borde FÍSICO de la pantalla, sin `overflow`. Lo que la hace desaparecer es
  el desvanecido tardío. **Un recorte que el usuario ve es un defecto aunque la geometría cuadre.**
- ⭐⭐⭐ **Los controles del header se van HACIA ARRIBA y fuera, no se quedan apagándose.** Clavados,
  la pieza sube ENTRE dos botones que siguen ahí, y eso se lee como algo pegado encima de una
  cabecera que no se entera. (`contentLift` en `CurvedHeader`.)
- ⭐⭐ **Primero el MOVIMIENTO, después la desaparición.** Una opacidad que cae desde el primer punto
  de scroll se lee como bajarle el brillo a algo; aguantando entera mientras viaja se lee como una
  superficie que se retira. El disparo es un hecho GEOMÉTRICO —que el canto superior haya salido—,
  no «pasada la mitad».
- ⭐⭐ **La pieza que vive FUERA del scroll necesita las DOS causas**: el dedo y lo que el header
  encoge. Con una sola, ella y su hueco reservado DIVERGEN y el título acaba leyéndose por debajo.

### El imán lo hace la PLATAFORMA

`snapToOffsets={[0, D]}` + `snapToEnd={false}`. iOS calcula el destino proyectado del gesto
—velocidad incluida— DENTRO del mismo gesto, antes de decelerar.

⚠️ **NUNCA reimplementarlo con `scrollTo` en `onEndDrag`/`onMomentumEnd`.** Pelea contra el motor de
deceleración y cada caso que se tapa destapa otro: tirón con impulso, reentrada por el propio
`scrollTo`, temblor por no aterrizar exacto. Es un anti-patrón documentado
(`react-native-collapsible-tab-view`), y encima `scrollTo` tiene issues abiertos en Reanimated 4
sobre Fabric (#8190, #9000).

⭐ **Un imán exige que el destino sea EXACTO**, no aproximado: sin él un error de geometría se
disimula; con él se aplica de golpe al soltar.

### Cómo se testea (y el error que hay que no repetir)

**Escribe los tests en COORDENADAS DE PANTALLA, no sobre la fórmula.** Los de la fórmula pasaron en
todas las versiones rotas. El invariante que de verdad importa:

```ts
// Al imantar, el techo del contenido se posa sobre el canto REAL del verde
expect(COLLAPSED + PHOTO_SLOT - D).toBe(GREEN_BOTTOM + TITLE_CLEARANCE);
// Y la pieza queda escondida en ESA MISMA línea — son la misma línea en la maquetación
expect(BLOCK_BOTTOM - D - SHRINK).toBe(GREEN_BOTTOM + TITLE_CLEARANCE);
// Y no divergen en NINGÚN punto del recorrido
for (const y of [0, 40, 90, 150, D]) expect(cardBottom(y)).toBeCloseTo(contentTop(y), 6);
```

⚠️ **Razona cuál es el dispositivo LÍMITE, no asumas que el pequeño es el peor.** «La foto aguanta
opaca hasta salir por arriba» aprieta con el área segura MÁS GRANDE (Pro Max) —tarda más en salir—;
«los controles se han ido antes de que llegue» aprieta con la MÁS PEQUEÑA (SE). Un test escrito
contra el extremo equivocado pasa sin exigir nada.

### Cuando el brief escrito y la IMAGEN discrepan

Gana la imagen — pero **avísalo**. Aquí el brief decía «los controles NO deben desplazarse» y el
fotograma 3 los mostraba cortados por el borde superior. Y decía «el usuario debe poder detener el
dedo en cualquier punto», que se leyó como una prohibición del imán cuando describía el DIBUJO
DURANTE el gesto, no el ATERRIZAJE al soltar. Son cosas distintas.

## Testear movimiento

⚠️ **El stub de `react-native-reanimated` hace estos defectos INVISIBLES.** `useAnimatedStyle` devuelve
`{}` y `withTiming` es la identidad: 396 tests estuvieron verdes con la barra destellando en el
dispositivo. **Un mock más amable que la realidad es un test que miente.**

Para ver un defecto de montaje hay que reproducir DOS cosas que el stub no hace:

```tsx
// 1. IDENTIDAD del shared value entre renders (el stub devuelve un objeto nuevo cada vez).
// 2. La escritura ASÍNCRONA: encolar y vaciar sólo cuando el test lo pide.
const uiThread: Array<() => void> = [];
useSharedValue: (initial) => { /* getter devuelve `applied`; setter hace uiThread.push(...) */ },
useAnimatedStyle: (updater) => { /* guarda el updater de la 1ª pasada y ejecútalo EN EL RENDER */ },
```

Reglas del test:
- **Se ejecuta el updater congelado en la FASE DE RENDER**, que es cuando y con qué lo hace `PropsFilter`.
- **Se afirman RELACIONES y FORMA, no milisegundos.** «El header arranca con la barra y aterriza con
  ella», «los pasos difieren en exactamente 1», «la cadencia es pareja». Las duraciones son gusto.
- **Verifica que el test puede FALLAR**: revierte el arreglo y comprueba el RED. Un test que no
  discrimina no vale nada — y dilo en el comentario si guarda otra cosa que el defecto.
- La lógica pura (tiempos, plan de un barrido, ancla) va a su **módulo aparte** y se prueba sin montar
  pantalla ni fingir el reloj: `search-choreography.ts`, `search-anchor.ts`, `wheel-autoplay-plan.ts`.

### ⭐⭐ El stub tiene que dejar AFIRMAR QUÉ CURVA se eligió

`Easing` era `new Proxy({}, { get: () => () => 0 })`: cualquier curva —lineal, bezier, la que fuera—
salía como una función nueva e indistinguible. Con eso **ningún test podía notar que a un reloj de
cascada le habían puesto una curva**, y la cascada del detalle se estuvo atropellando durante una
fase entera con 480 tests en verde (§7a).

El arreglo, en `src/test/reanimated-stub.tsx`: cada nombre devuelve **siempre la misma** función
(identidad estable) etiquetada con su `easingName`; llamarla —`Easing.bezier(...)`, `Easing.out(...)`—
devuelve otra etiquetada con la llamada (`out(cubic)`). Se lee con `easingNameOf(config.easing)`:

```ts
expect(easingNameOf(ENTRANCE_TIMING.easing)).toBe("linear");
// en rojo daba: expected 'bezier(0.2,0,0,1)' to be 'linear'
```

> **Cuando un defecto se te escapa, pregúntate qué le falta al ARNÉS para poder verlo.** Arreglar el
> stub es parte del arreglo, no una tarea aparte: si no, el siguiente defecto de la misma familia
> también pasará.

### ⭐ Medir en PROGRESO no es medir lo que se ve

Cuatro tests verdes afirmaban que un escalón duraba lo medido… en fracción de reloj. En milisegundos
duraba menos de la mitad. **Si el usuario percibe milisegundos, el test afirma milisegundos**: pon una
función pura que traduzca el plan a tiempo real (`stepScheduleMs`) y afirma sobre ella.

## Anti-patrones

| Anti-patrón | Por qué muerde |
|---|---|
| `transform: scale` sobre un `GlassView` o un ancestro | iOS rasteriza el material: satura y granula. Para crecer, anima ancho/alto como layout REAL |
| `opacity: 0` sobre un `GlassView` o cualquier padre | El efecto no se dibuja (documentado por Expo) |
| Animar la opacidad de un contenedor con muchos hijos | Compositing alfa fuera de pantalla en CADA fotograma. Usa `translateY` |
| Un `withDelay` que espera al `onXFinished` de otra animación | Cola de sucesos, no una transición |
| `MIN_TRAVEL` y demás suelos como «red de seguridad» | Si se activa, ESE es el glitch |
| Guardar «la última medida buena» | Envejece: `onLayout` no se dispara al hacer scroll |
| Un *easing* en el RELOJ de una cascada | Aplasta el escalonado: los del medio se amontonan (§7a) |
| Reiniciar un reloj a mano al cambiar de contenido | La escritura desde JS ENCOLA → un fotograma a opacidad plena (§10b) |
| Colgar la identidad de una entrada del parámetro de RUTA | Cambia antes que los datos: anima el contenido viejo (§10c) |
| Dar por hecho que «entrar» es «montar» | Con caché el contenido monta con la pantalla y la entrada se gasta en la transición (§11) |
| Un worklet que llama a otro declarado MÁS ABAJO | `undefined is not a function` en dispositivo, con los tests verdes: el arnés no lo ve (§12) |
| Medir un aterrizaje contra la ALTURA del header | La panza cuelga fuera de la caja: te pasas por su alto |
| Calcular un plegado como si sólo lo moviera el dedo | El `ScrollView` es hermano del header y sube CON él: cuánto viaja ≠ cuánto scroll hace falta |
| Recortar una pieza que sale contra un canto inventado | Se ve AMPUTADA: canto recto y esquinas cuadradas. Que salga por el borde de la pantalla |
| Reimplementar el imán con `scrollTo` en `onEndDrag` | Pelea contra la deceleración de iOS: tirón, reentrada y temblor. `snapToOffsets` |
| Escribir los tramos de un plegado en PUNTOS | Ata la coreografía a un teléfono. Fracciones de un recorrido derivado |
| Probar un plegado sólo sobre la FÓRMULA | Pasa con la geometría rota. Los tests van en coordenadas de PANTALLA |

## Commands

```bash
pnpm --filter @cuadra/mobile typecheck
pnpm --filter @cuadra/mobile test
npx react-doctor@latest --verbose --scope changed   # caza refs mutados en el render
```

⚠️ **Ni el typecheck ni los tests dicen si el movimiento se ve bien.** Verificación visual en
dispositivo, con bundle de producción (`./dev-fast.command` — en modo dev el inspector de red retiene
cada respuesta y el GC se come los fotogramas). Ver `cuadra-ui-verify`.

## Resources

- `apps/mobile/src/features/save/supermarket/search-choreography.ts` — tiempos compartidos entre hoja y pantalla
- `apps/mobile/src/features/save/supermarket/search-anchor.ts` — la posición DERIVADA, no medida
- `apps/mobile/src/features/save/supermarket/search/search-overlay.tsx` — la fórmula del montaje y el timeline reversible
- `apps/mobile/src/components/ui/cascade-item.tsx` — un reloj, una ventana por fila (COMPARTIDO: buscador y detalle)
- `apps/mobile/src/features/save/supermarket/product/motion/entrance.ts` — reloj LINEAL, reparto de puestos, `stepScheduleMs`, `entranceKeyOf`
- `apps/mobile/src/features/save/supermarket/product/motion/arrival.ts` — cuándo ha LLEGADO la pantalla (§11)
- `apps/mobile/src/features/save/supermarket/product/components/product-entrance.tsx` — dueño del reloj + `useEntranceVisit`
- `apps/mobile/src/features/save/supermarket/components/wheel-autoplay-plan.ts` — el plan como función pura
- `apps/mobile/src/features/save/supermarket/product/motion/gallery-collapse.ts` — el PLEGADO entero: `collapseDistance`, `headerShrinkOf`, los tramos y `snapOffsetsFor`
- `apps/mobile/src/features/save/supermarket/product/motion/worklet-order.test.ts` — guardia del orden de declaración. PORTABLE a cualquier carpeta de worklets
- `apps/mobile/src/features/save/supermarket/product/product-screen.tsx` — la geometría, ARRIBA del todo (un `const` leído por un `useDerivedValue` declarado antes es un TDZ que revienta en el primer render)
- `apps/mobile/src/components/ui/top-scroll-fade.tsx` — el desenfoque del canto superior (chat, hub y detalle). Con `zIndex` entre la lista y la cabecera, SIGUE A LA CURVA sin dibujarla
- `apps/mobile/src/test/reanimated-stub.tsx` — el arnés. Ya identifica las CURVAS (`easingNameOf`). LEER antes de escribir un test de movimiento
