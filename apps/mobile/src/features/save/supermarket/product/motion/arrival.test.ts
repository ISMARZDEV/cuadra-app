import { describe, expect, test } from "vitest";

import { ARRIVAL_SLIDE_MS, settleDelayMs } from "./arrival";

describe("cuándo ha LLEGADO la pantalla", () => {
  test("con los datos en CACHÉ se espera el deslizamiento entero", () => {
    // El contenido monta en el mismo commit que la pantalla. Sin esperar, los 394 ms de cascada se
    // gastan mientras la pantalla se desliza y al posarse ya está todo puesto.
    expect(settleDelayMs(0)).toBe(ARRIVAL_SLIDE_MS);
  });

  test("con los datos FRÍOS se espera sólo lo que falte", () => {
    // Aquí el contenido monta a mitad del deslizamiento porque antes hubo un «cargando». Volver a
    // esperar el deslizamiento COMPLETO metería un tiempo muerto que no existía.
    expect(settleDelayMs(220)).toBe(ARRIVAL_SLIDE_MS - 220);
  });

  test("volviendo de otra pestaña NO se espera nada", () => {
    // La pantalla lleva montada una eternidad y no se desliza ninguna: esperar sería dejar la
    // cabecera invisible sin que nada esté ocurriendo.
    expect(settleDelayMs(60_000)).toBe(0);
    expect(settleDelayMs(ARRIVAL_SLIDE_MS)).toBe(0);
  });

  test("nunca devuelve un negativo", () => {
    // Un retraso negativo en `setTimeout` dispara al instante — que aquí sería correcto por
    // casualidad, y por casualidad no se sostiene nada.
    expect(settleDelayMs(ARRIVAL_SLIDE_MS + 500)).toBe(0);
  });

  test("un reloj imposible espera lo MÁXIMO, no lo mínimo", () => {
    // `Date.now()` puede saltar hacia atrás (cambio de hora, sincronización). Ante un dato que no
    // se puede creer, la respuesta segura es esperar: arrancar antes de tiempo es el defecto.
    expect(settleDelayMs(-1)).toBe(ARRIVAL_SLIDE_MS);
    expect(settleDelayMs(Number.NaN)).toBe(ARRIVAL_SLIDE_MS);
  });
});
