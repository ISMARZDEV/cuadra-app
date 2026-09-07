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

  test("sin tocarlo, se cierra solo", () => {
    useOrbStore.getState().show();
    vi.advanceTimersByTime(9_000);
    expect(useOrbStore.getState().active).toBe(false);
  });
});
