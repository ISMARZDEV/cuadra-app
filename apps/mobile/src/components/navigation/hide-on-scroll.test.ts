import { describe, expect, test } from "vitest";

import { COMMIT_DISTANCE, MIN_SCROLL_SCREENS, nextHiddenState, type ScrollFrame } from "./hide-on-scroll";

const frame = (over: Partial<ScrollFrame> = {}): ScrollFrame => ({
  y: 500,
  maxY: 3000,
  viewportH: 800,
  dy: 0,
  accum: 0,
  dragging: true,
  hidden: false,
  pinned: false,
  ...over,
});

describe("nextHiddenState", () => {
  test("arrastrando hacia abajo lo suficiente, la barra se va", () => {
    const r = nextHiddenState(frame({ dy: 10, accum: COMMIT_DISTANCE + 1 }));

    expect(r.hidden).toBe(true);
  });

  test("un temblor de un frame NO decide nada", () => {
    // GUARDA 4 — histéresis. Con el delta de un solo frame, el pulso de la mano hacía parpadear
    // la barra. Hay que comprometer distancia en la MISMA dirección.
    expect(nextHiddenState(frame({ dy: 3, accum: 3 })).hidden).toBe(false);
  });

  test("cambiar de sentido reinicia la cuenta", () => {
    // Si no, media pantalla hacia abajo y media hacia arriba sumarían como si fueran lo mismo.
    const r = nextHiddenState(frame({ dy: -5, accum: COMMIT_DISTANCE - 2 }));

    expect(r.accum).toBe(-5);
  });

  test("sin el dedo encima no se decide: la inercia no es intención", () => {
    // GUARDA 2 — al llegar al final, el asentamiento genera deltas en los dos sentidos y la barra
    // se escondía y reaparecía sola. Esconder navegación responde a una INTENCIÓN; el impulso es
    // física.
    const r = nextHiddenState(frame({ dragging: false, dy: 40, accum: 200, hidden: false }));

    expect(r.hidden).toBe(false);
  });

  test("si el recorrido no COMPENSA, nunca se esconde", () => {
    // GUARDA 1 — con dos o tres filas la barra se escondía sólo para reaparecer al llegar al final
    // un segundo después. Se exige al menos una pantalla de recorrido por delante.
    const r = nextHiddenState(
      frame({ maxY: 800 * MIN_SCROLL_SCREENS - 1, dy: 40, accum: 200, hidden: true }),
    );

    expect(r.hidden).toBe(false);
  });

  test("el REBOTE no es recorrido", () => {
    // GUARDA 3 — fuera del rango real (arrastre elástico) el estado se congela.
    expect(nextHiddenState(frame({ y: -40, dy: 40, accum: 200 })).hidden).toBe(false);
    expect(nextHiddenState(frame({ y: 3200, dy: 40, accum: 200, hidden: true })).hidden).toBe(true);
  });

  test("cerca del tope siempre visible, mires donde mires", () => {
    const r = nextHiddenState(frame({ y: 10, dy: 40, accum: 200, hidden: true }));

    expect(r.hidden).toBe(false);
  });

  test("subiendo con decisión, vuelve", () => {
    const r = nextHiddenState(frame({ dy: -10, accum: -(COMMIT_DISTANCE + 1), hidden: true }));

    expect(r.hidden).toBe(false);
  });
});

describe("nextHiddenState — anclada", () => {
  test("con la barra anclada, ni el scroll más decidido la esconde", () => {
    // La regla del detalle: con cantidad ≥ 1 se queda, aunque se recorra la pantalla entera.
    const r = nextHiddenState(frame({ pinned: true, dy: 200, accum: 400 }));

    expect(r.hidden).toBe(false);
  });

  test("anclada gana ANTES que cualquier otra guarda", () => {
    // Incluso viniendo de escondida por un scroll anterior, anclar la trae de vuelta.
    expect(nextHiddenState(frame({ pinned: true, hidden: true, dy: 200, accum: 400 })).hidden).toBe(
      false,
    );
  });
});
