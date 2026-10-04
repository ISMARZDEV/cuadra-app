import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { EXIT_STAIR_ONSETS_MS, STAIR_ONSETS_MS } from "./send-stairs";
import { useHapticStairs } from "./use-haptic-stairs";

const haptics = vi.hoisted(() => ({ step: vi.fn() }));
vi.mock("@/lib/haptics/orb-haptics", () => ({ orbStairStep: haptics.step }));

function Sonda({ armed, onsets }: { armed: boolean; onsets: readonly number[] }) {
  useHapticStairs(armed, onsets);
  return null;
}

const avanzar = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("useHapticStairs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    haptics.step.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  test("desarmada no vibra nada", () => {
    render(<Sonda armed={false} onsets={STAIR_ONSETS_MS} />);
    avanzar(2000);
    expect(haptics.step).not.toHaveBeenCalled();
  });

  /**
   * ⭐⭐ **Cada peldaño cae en SU milisegundo, no «por ahí».** Con el sonido, la escalera sólo se
   * percibe como el audio teniendo cuerpo si coincide con sus ataques; desplazada, se percibe como
   * un eco. Por eso se afirma el reloj de cada uno y no sólo el total.
   */
  test("los peldaños del SONIDO caen en los ataques del clip", () => {
    render(<Sonda armed onsets={STAIR_ONSETS_MS} />);
    let previo = 0;
    STAIR_ONSETS_MS.forEach((at, i) => {
      avanzar(at - previo - 1);
      expect(haptics.step).toHaveBeenCalledTimes(i);
      avanzar(1);
      expect(haptics.step).toHaveBeenCalledTimes(i + 1);
      previo = at;
    });
  });

  test("los de la SALIDA arrancan con el movimiento —el primero, ya", () => {
    render(<Sonda armed onsets={EXIT_STAIR_ONSETS_MS} />);
    avanzar(0);
    expect(haptics.step).toHaveBeenCalledTimes(1);
    avanzar(EXIT_STAIR_ONSETS_MS[EXIT_STAIR_ONSETS_MS.length - 1]);
    expect(haptics.step).toHaveBeenCalledTimes(EXIT_STAIR_ONSETS_MS.length);
  });

  test("la escalera ASCIENDE: de difuso a nítido", () => {
    render(<Sonda armed onsets={STAIR_ONSETS_MS} />);
    avanzar(2000);
    expect(haptics.step.mock.calls.map((c) => c[0])).toEqual(["soft", "light", "rigid"]);
  });

  test("no se repite: es un suceso, no un latido", () => {
    render(<Sonda armed onsets={STAIR_ONSETS_MS} />);
    avanzar(10000);
    expect(haptics.step).toHaveBeenCalledTimes(STAIR_ONSETS_MS.length);
  });

  test("si el ciclo muere a mitad, la escalera muere con él", () => {
    // Media escalera sin lo que la explica es una vibración suelta que nadie sabe atribuir.
    const view = render(<Sonda armed onsets={STAIR_ONSETS_MS} />);
    avanzar(STAIR_ONSETS_MS[0] + 1);
    expect(haptics.step).toHaveBeenCalledTimes(1);

    act(() => view.rerender(<Sonda armed={false} onsets={STAIR_ONSETS_MS} />));
    avanzar(5000);

    expect(haptics.step).toHaveBeenCalledTimes(1);
  });
});
