import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useDebouncedValue } from "./use-debounced-value";

describe("useDebouncedValue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("returns the initial value straight away", () => {
    const { result } = renderHook(() => useDebouncedValue("guan", 300));

    expect(result.current).toBe("guan");
  });

  test("holds the new value back until the delay has elapsed", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: "g" },
    });

    rerender({ v: "gua" });
    expect(result.current).toBe("g");

    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe("gua");
  });

  // LO QUE HACE ÚTIL AL DEBOUNCE: escribir rápido NO produce un valor intermedio por tecla. Sin
  // esto sería un simple retardo, y cada pulsación seguiría disparando su búsqueda 300ms después.
  test("a fast typist produces ONE value, not one per keystroke", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: "g" },
    });

    for (const v of ["gu", "gua", "guan"]) {
      act(() => vi.advanceTimersByTime(100)); // menos que el retardo: nunca llega a asentar
      rerender({ v });
    }
    expect(result.current).toBe("g");

    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe("guan");
  });

  // Para un consumidor que COBRA por llamada, montar con un valor ya presente no es evidencia de
  // que el usuario se haya detenido. `initial` le permite exigir la pausa siempre.
  test("can be told to start from a different value instead of seeding on mount", () => {
    const { result } = renderHook(() => useDebouncedValue("cuanto gaste", 700, ""));

    expect(result.current).toBe("");

    act(() => vi.advanceTimersByTime(700));
    expect(result.current).toBe("cuanto gaste");
  });

  test("drops a pending value when the component unmounts", () => {
    const { rerender, unmount } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: "g" },
    });

    rerender({ v: "guan" });
    unmount();

    // Sin el clearTimeout del cleanup, este avance dispararía un setState sobre un componente
    // desmontado.
    expect(() => act(() => vi.advanceTimersByTime(300))).not.toThrow();
  });
});
