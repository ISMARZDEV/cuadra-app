import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { QueryWrapper } from "@/test/query-wrapper";

import { SearchOverlay } from "./search-overlay";

// EL DESTELLO DE LA BARRA ARRIBA: por qué este test existe y por qué está escrito ASÍ.
//
// Síntoma: al abrir el buscador, la barra APARECE ARRIBA durante uno o más fotogramas —con el
// header verde intacto y las categorías todavía puestas, sin teclado y sin telón—, luego baja de
// golpe y sube animando.
//
// La causa NO estaba en nuestro código de animación. Se atacó cuatro veces (doble disparo del
// efecto, medidas a 0, recorrido cero, reseteo tardío de los shared values) y ninguna bastó,
// porque todas arreglaban el lado JS. Estaba en una semántica de Reanimated que hay que conocer:
//
//   `useAnimatedStyle` CONGELA el updater de la PRIMERA pasada del hook y NO lo reasigna jamás
//   (`if (!animatedUpdaterData.current)`, en `hook/useAnimatedStyle.js`). Al MONTARSE la vista,
//   el estilo con el que nace se calcula ejecutando ESE updater congelado —no el del render
//   actual— (`initialUpdaterRun(handle.initial.updater)`, en `createAnimatedComponent/PropsFilter.js`).
//
// Un worklet captura las variables JS de su clausura POR VALOR. `travel` era un número normal, así
// que el updater congelado seguía llevando el `travel` del PRIMER render de la pantalla —cuando
// `fromY` todavía valía 0 y el suelo `MIN_TRAVEL` lo dejaba en 56—. La barra nacía 56px por debajo
// de su sitio final: ARRIBA. Un fotograma después, el updater DE VERDAD corría con el recorrido
// bueno y la barra saltaba abajo. «A veces» porque es una carrera con el hilo de UI.
//
// Un SHARED VALUE se captura por REFERENCIA: el updater congelado lee `.value` en el instante de
// ejecutarse y obtiene el recorrido de ESTA apertura. Ésa es la corrección, y esto la fija.

/**
 * La cola del HILO DE UI: lo que reanimated encoló y todavía no ha aplicado.
 *
 * Escribir un shared value desde JS no escribe, ENCOLA. Mientras esta cola no se vacía, el valor
 * sigue siendo el anterior — que es exactamente la condición del defecto.
 */
const uiThread: Array<() => void> = [];

/** Los shared values en orden de creación: sheet, lift, squeeze, cascade, travelValue. */
const sharedValues: Array<{ value: unknown }> = [];

/** Deja que el hilo de UI aplique lo pendiente. */
function flushUiThread() {
  while (uiThread.length > 0) uiThread.shift()!();
}

/** Un `useAnimatedStyle` visto desde fuera: su updater congelado y lo que fue devolviendo. */
interface FrozenStyle {
  run: () => Record<string, unknown>;
  results: Array<Record<string, unknown>>;
}

const styles: FrozenStyle[] = [];

// ⚠️ ESTE MOCK NO ES UNA COMODIDAD: reproduce la congelación de arriba. Con el stub normal
// (`useAnimatedStyle = () => ({})`) no hay updater que ejecutar y el defecto es INVISIBLE — por eso
// los tests que ya había pasaban con la barra destellando en el dispositivo.
vi.mock("react-native-reanimated", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const stub =
    await vi.importActual<Record<string, unknown>>("react-native-reanimated");
  return {
    ...stub,
    // ⚠️ DOS COSAS QUE EL STUB NORMAL NO HACE, Y LAS DOS SON NECESARIAS PARA VER EL DEFECTO.
    //
    // 1. IDENTIDAD. El stub devuelve un objeto NUEVO en cada render; el de verdad conserva EL MISMO.
    //    Esa identidad es lo que permite que un worklet lea el valor en vivo.
    //
    // 2. ⭐ LA ESCRITURA ES ASÍNCRONA. En nativo, asignar `.value` desde el hilo de JS no escribe:
    //    ENCOLA (`scheduleOnUI(() => { mutable.value = newValue })`, en `mutables.js`). El hilo de
    //    UI lo aplica DESPUÉS. Así que un valor escrito en el cuerpo del render NO está puesto
    //    cuando la vista se monta en ese mismo commit — se lee la semilla del `useSharedValue`.
    //
    //    Aquí se reproduce con una cola que sólo se vacía cuando el test lo pide. Sin esto, el mock
    //    escribiría al instante y el defecto sería otra vez invisible, como con el stub original.
    useSharedValue: (initial: unknown) => {
      const ref = React.useRef<{ value: unknown } | null>(null);
      if (ref.current === null) {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        void 0;
        let applied = initial;
        ref.current = {
          get value() {
            return applied;
          },
          set value(next: unknown) {
            uiThread.push(() => {
              applied = next;
            });
          },
        };
        sharedValues.push(ref.current);
      }
      return ref.current;
    },
    useAnimatedStyle: (updater: () => Record<string, unknown>) => {
      const slot = React.useRef<number | null>(null);
      if (slot.current === null) {
        slot.current = styles.length;
        styles.push({ run: updater, results: [] });
      }
      const style = styles[slot.current];
      // Se anota lo que devuelve el updater CONGELADO en la FASE DE RENDER, que es exactamente
      // cuando y con qué lo ejecuta `PropsFilter` para dar a la vista su estilo de montaje.
      style.results.push(style.run());
      return {};
    },
  };
});

// Este test no va de «reducir movimiento», y el hook se suscribe a `AccessibilityInfo`, que bajo
// react-native-web devuelve una suscripción vacía y revienta al desmontar. Fuera de en medio.
vi.mock("../../components/use-reduce-motion", () => ({ useReduceMotion: () => false }));

/** `useSafeAreaInsets` del stub da 0 arriba, así que la barra se posa en `restY = 0 + 8`. */
const REST_Y = 8;
/** Dónde está la píldora de reposo en la home: abajo, bajo el header y la ruleta. */
const FROM_Y = 430;

const noop = () => {};

function overlay(props: { visible: boolean; fromY: number }) {
  return (
    <QueryWrapper>
      <SearchOverlay
        visible={props.visible}
        fromY={props.fromY}
        placeholder="Buscar producto…"
        onClose={noop}
        onSubmit={noop}
        onClosed={noop}
        onReturning={noop}
      />
    </QueryWrapper>
  );
}

/** El desplazamiento vertical con el que nació la barra. Es el único estilo que mueve en Y — los
 *  demás son ancho, opacidad y una escala. */
function barTranslateY(): number {
  for (const style of styles) {
    const now = style.run() as { transform?: Array<Record<string, number>> };
    const step = now.transform?.find((t) => "translateY" in t);
    if (step) return step.translateY;
  }
  throw new Error("Ningún estilo animado desplaza en vertical");
}

function mountTranslateY(): number {
  for (const style of styles) {
    const born = style.results[0] as { transform?: Array<Record<string, number>> } | undefined;
    const step = born?.transform?.find((s) => "translateY" in s);
    if (step) return step.translateY;
  }
  throw new Error("Ningún estilo animado nació con un desplazamiento vertical");
}

describe("SearchOverlay · el viaje de la barra", () => {
  beforeEach(() => {
    styles.length = 0;
    uiThread.length = 0;
    sharedValues.length = 0;
  });

  test("al MONTARSE no se desplaza: descansa donde la maquetación la pone", () => {
    // La pantalla nace con la hoja cerrada y sin medida. Este render CONGELA los updaters.
    const { rerender } = render(overlay({ visible: false, fromY: 0 }));
    for (const style of styles) style.results.length = 0;

    // Se abre, ya con la posición real. La vista se MONTA en este commit, y el hilo de UI todavía
    // NO ha aplicado el recorrido de esta apertura: sigue puesto el de la semilla.
    rerender(overlay({ visible: true, fromY: FROM_Y }));

    // ⭐ Y DA IGUAL, porque a `lift = 0` el recorrido va multiplicado por cero. Un valor rancio
    // multiplicado por cero es cero, así que el fotograma de montaje es correcto SIEMPRE — venga
    // el recorrido puesto o no. Ésa es toda la corrección.
    // `toBeCloseTo` y no `toBe`: el producto sale `-0` y `Object.is(-0, 0)` es falso. En pantalla
    // −0 y 0 son el mismo píxel; lo que se afirma es que NO HAY desplazamiento, no su signo.
    expect(mountTranslateY()).toBeCloseTo(0);
  });

  test("con el reloj arriba, el viaje es el de ESTA apertura", () => {
    const { rerender } = render(overlay({ visible: false, fromY: 0 }));
    rerender(overlay({ visible: true, fromY: FROM_Y }));

    // El hilo de UI aplica lo encolado —el recorrido de esta apertura— y el reloj llega al final.
    flushUiThread();
    const lift = sharedValues[1];
    lift.value = 1;
    flushUiThread();

    // Recorrido completo hacia arriba: la barra se posa en `restY`.
    expect(barTranslateY()).toBe(-(FROM_Y - REST_Y));
  });

  test("cada reapertura viaja lo de AHORA, no lo de la vez pasada", () => {
    const { rerender } = render(overlay({ visible: false, fromY: 0 }));
    rerender(overlay({ visible: true, fromY: FROM_Y }));
    flushUiThread();
    rerender(overlay({ visible: false, fromY: FROM_Y }));
    flushUiThread();

    // Entre una apertura y otra el usuario desplazó la home: la píldora subió.
    const SCROLLED_Y = 300;
    rerender(overlay({ visible: true, fromY: SCROLLED_Y }));
    flushUiThread();
    const lift = sharedValues[1];
    lift.value = 1;
    flushUiThread();

    expect(barTranslateY()).toBe(-(SCROLLED_Y - REST_Y));
  });
});
