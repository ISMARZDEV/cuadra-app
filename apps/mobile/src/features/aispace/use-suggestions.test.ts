import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn() }));

import { useSuggestionUsageStore } from "@/store/suggestion-usage-store";

import { orderSuggestions, useSuggestions } from "./use-suggestions";

const ALL = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

// Fisher-Yates con `random` clavado en 0 elige siempre j=0, que es una rotación a la izquierda:
// determinista y fácil de leer en una aserción. No es "el orden correcto" — es UN orden fijo, que
// es todo lo que un test de barajado necesita.
const zero = () => 0;

describe("orderSuggestions", () => {
  test("puts the three most-sent first, in descending order", () => {
    const usage = { c: 9, f: 2, a: 5, h: 1 };

    expect(orderSuggestions(ALL, usage, zero).slice(0, 3)).toEqual(["c", "a", "f"]);
  });

  test("keeps every suggestion exactly once", () => {
    const result = orderSuggestions(ALL, { c: 9, a: 5 }, zero);

    expect([...result].sort()).toEqual([...ALL].sort());
  });

  test("shuffles the tail — the ones never sent don't keep a fixed order", () => {
    const tail = orderSuggestions(ALL, { c: 9, a: 5, f: 2 }, zero).slice(3);
    const untouched = ALL.filter((k) => !["c", "a", "f"].includes(k));

    expect(tail).not.toEqual(untouched); // se barajó
    expect([...tail].sort()).toEqual([...untouched].sort()); // sin perder ni duplicar
  });

  test("with no history at all it is pure shuffle", () => {
    const result = orderSuggestions(ALL, {}, zero);

    expect([...result].sort()).toEqual([...ALL].sort());
    expect(result).not.toEqual([...ALL]);
  });

  test("promotes fewer than three when the user has sent fewer than three", () => {
    const result = orderSuggestions(ALL, { d: 3 }, zero);

    expect(result[0]).toBe("d");
  });

  // Una sugerencia retirada del catálogo puede seguir viva en el historial persistido de un
  // usuario viejo. No debe reaparecer ni dejar un hueco.
  test("ignores history entries that no longer exist in the catalog", () => {
    const result = orderSuggestions(ALL, { borrada: 99, b: 4 }, zero);

    expect(result).not.toContain("borrada");
    expect(result[0]).toBe("b");
    expect(result).toHaveLength(ALL.length);
  });
});

describe("useSuggestions", () => {
  beforeEach(() => {
    useSuggestionUsageStore.setState({ usage: {}, restored: true });
  });

  // La baraja se decide UNA vez por tanda, no en cada render — misma doctrina que
  // use-status-sequence.ts, donde el arranque aleatorio se fija una vez "o la palabra saltaría
  // sola entre frames". Acá saltarían las píldoras bajo el dedo del usuario.
  test("keeps the same order across re-renders", () => {
    const { result, rerender } = renderHook(() => useSuggestions(Math.random));
    const first = result.current.keys;

    rerender();
    rerender();

    expect(result.current.keys).toBe(first);
  });

  test("reshuffle() draws a new batch", () => {
    const { result } = renderHook(() => useSuggestions(Math.random));
    const first = result.current.keys;

    act(() => result.current.reshuffle());

    expect(result.current.keys).not.toBe(first);
  });
});
