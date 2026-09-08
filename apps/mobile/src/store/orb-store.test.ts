import { beforeEach, describe, expect, test, vi } from "vitest";

import { useOrbStore } from "./orb-store";

/**
 * El auto-ocultado del orbe es para el ABANDONO. Un dedo apoyado es lo contrario, y aun así el orbe
 * se cerraba a los 8 s en mitad del gesto: `setPressing(true)` cancelaba el temporizador y el
 * `bump()` de la línea siguiente lo volvía a armar.
 *
 * Se prueba con relojes falsos porque el defecto es TEMPORAL: sin adelantar el reloj no se
 * manifiesta, y a 8 s de espera real nadie escribiría este test.
 */
describe("orb-store · auto-ocultado", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useOrbStore.getState().hide();
  });

  test("con el dedo APOYADO no se cierra, por mucho que pase el tiempo", () => {
    const { show, setPressing, bump } = useOrbStore.getState();
    show();
    // El orden EXACTO de la barra: primero se marca la pulsación, luego se golpea la onda.
    setPressing(true);
    bump();

    vi.advanceTimersByTime(60_000);

    expect(useOrbStore.getState().active).toBe(true);
  });

  test("al SOLTAR vuelve a contar, y entonces sí se cierra", () => {
    const { show, setPressing } = useOrbStore.getState();
    show();
    setPressing(true);
    vi.advanceTimersByTime(60_000);
    setPressing(false);

    // Recién soltado sigue abierto: la cuenta empieza de cero, no arrastra lo ya esperado.
    vi.advanceTimersByTime(7_000);
    expect(useOrbStore.getState().active).toBe(true);

    vi.advanceTimersByTime(2_000);
    expect(useOrbStore.getState().active).toBe(false);
  });

  test("un segundo evento de soltar es idempotente y no reinicia la transición", () => {
    const { show, setPressing } = useOrbStore.getState();
    show();
    setPressing(true);
    setPressing(false);

    // iOS puede entregar release y luego terminate/cancel para el mismo contacto.
    setPressing(false);
    expect(useOrbStore.getState()).toMatchObject({ active: true, pressing: false });
  });

  test("sin tocarlo, se cierra solo", () => {
    useOrbStore.getState().show();
    vi.advanceTimersByTime(9_000);
    expect(useOrbStore.getState().active).toBe(false);
  });

  test("EN MITAD DEL DICTADO no se cierra, aunque el reconocedor tarde en soltar", () => {
    // ⚠️⚠️ **El defecto que se veía como «el orbe desaparece y vuelve».**
    //
    // Al soltar sin decir nada, el reconocedor no emite su `end` y el ciclo espera hasta el tope de
    // 10 s. El ocioso son 8 s: dos segundos en los que `active` caía a false con la CÚPULA todavía
    // puesta. El velo exige `listening`, pero el control exige además `active` — así que quedaba el
    // fondo deformado y ningún orbe encima. Comprobado en el simulador antes de escribir esto.
    //
    // Es la MISMA regla que ya protegía al dedo apoyado: el auto-ocultado es para el ABANDONO, y
    // estar a mitad de un dictado es lo contrario de abandonar.
    const { show, setPressing, setLensHold } = useOrbStore.getState();
    show();
    setPressing(true);
    setPressing(false);
    setLensHold(true); // la lente publica que el ciclo sigue vivo

    vi.advanceTimersByTime(60_000);

    expect(useOrbStore.getState().active).toBe(true);
  });

  test("terminado el dictado, el ocioso vuelve a contar desde CERO", () => {
    // Si no se rearmara, el orbe se cerraría de golpe en cuanto el ciclo termina —justo cuando el
    // usuario acaba de recuperar el control y podría querer usarlo—.
    const { show, setPressing, setLensHold } = useOrbStore.getState();
    show();
    setPressing(true);
    setPressing(false);
    setLensHold(true);
    vi.advanceTimersByTime(60_000);

    setLensHold(false);
    vi.advanceTimersByTime(7_000);
    expect(useOrbStore.getState().active).toBe(true);

    vi.advanceTimersByTime(2_000);
    expect(useOrbStore.getState().active).toBe(false);
  });
});
