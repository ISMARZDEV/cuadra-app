---
name: cuadra-motion
description: >
  Movimiento en la app Expo de Cuadra: la MECÁNICA de Reanimated 4 (qué se congela, qué viaja entre
  hilos y qué se lee tarde), cómo se coreografía una transición entre varias piezas, cómo se ANCLA
  algo que viaja, y cómo se TESTEA todo eso cuando el stub de pruebas hace los defectos invisibles.
  Cada regla salió de un defecto real y trae el síntoma por el que se reconoce.
  Trigger: construir o depurar CUALQUIER animación en `apps/mobile` — `useAnimatedStyle`,
  `useSharedValue`, `withTiming`/`withSpring`/`withDelay`, `useAnimatedScrollHandler`, worklets,
  transiciones entre pantallas, carruseles que se mueven solos, cascadas/escalonados. Dueña además
  del PATRÓN COMPLETO «una pantalla que se REORGANIZA para dejarle sitio a un campo» — el campo que
  sube desde su sitio en reposo empujando el header/carrusel hacia arriba y vuelve al cancelar—,
  listo para reusar en pantallas nuevas. Cargar también ante
  síntomas como «aparece en el sitio equivocado un fotograma», «salta al abrir/cerrar», «a veces sí
  y a veces no», «la primera vez falla y después va bien», «se mueve demasiado despacio/rápido» o
  «el control no responde al dedo mientras se anima».
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

## Anti-patrones

| Anti-patrón | Por qué muerde |
|---|---|
| `transform: scale` sobre un `GlassView` o un ancestro | iOS rasteriza el material: satura y granula. Para crecer, anima ancho/alto como layout REAL |
| `opacity: 0` sobre un `GlassView` o cualquier padre | El efecto no se dibuja (documentado por Expo) |
| Animar la opacidad de un contenedor con muchos hijos | Compositing alfa fuera de pantalla en CADA fotograma. Usa `translateY` |
| Un `withDelay` que espera al `onXFinished` de otra animación | Cola de sucesos, no una transición |
| `MIN_TRAVEL` y demás suelos como «red de seguridad» | Si se activa, ESE es el glitch |
| Guardar «la última medida buena» | Envejece: `onLayout` no se dispara al hacer scroll |

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
- `apps/mobile/src/features/save/supermarket/search/cascade-item.tsx` — un reloj, una ventana por fila
- `apps/mobile/src/features/save/supermarket/components/wheel-autoplay-plan.ts` — el plan como función pura
- `apps/mobile/src/test/reanimated-stub.tsx` — el stub que hace invisibles estos defectos. LEER antes de escribir un test de movimiento
