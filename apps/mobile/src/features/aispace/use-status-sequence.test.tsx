import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ChatStatus } from "./enums";
import { STEP_MS, useStatusSequence } from "./use-status-sequence";

// Timers falsos: la secuencia es pura lógica de tiempo, y con timers reales cada test costaría
// varios segundos de espera muerta.
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe("useStatusSequence", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("a search walks Buscando → Validando → Analizando", () => {
    const { result } = renderHook(() => useStatusSequence(ChatStatus.Searching, true));

    expect(result.current).toBe(ChatStatus.Searching);
    advance(STEP_MS);
    expect(result.current).toBe(ChatStatus.Validating);
    advance(STEP_MS);
    expect(result.current).toBe(ChatStatus.Analyzing);
  });

  test("the search HOLDS on the last step instead of looping back to the first", () => {
    // Volver a «Buscando…» después de «Analizando…» se leería como retroceder, y el trabajo no
    // retrocede.
    const { result } = renderHook(() => useStatusSequence(ChatStatus.Searching, true));

    advance(STEP_MS);
    advance(STEP_MS);
    advance(STEP_MS);
    advance(STEP_MS);

    expect(result.current).toBe(ChatStatus.Analyzing);
  });

  test("a search never shows the idle words", () => {
    const { result } = renderHook(() => useStatusSequence(ChatStatus.Searching, true));
    const seen = [result.current];
    for (let i = 0; i < 4; i++) {
      advance(STEP_MS);
      seen.push(result.current);
    }

    expect(seen).not.toContain(ChatStatus.Thinking);
    expect(seen).not.toContain(ChatStatus.Reasoning);
  });

  test("without a search it alternates Pensando ↔ Razonando forever", () => {
    // Las dos palabras dicen lo mismo: es la misma espera. Alternarlas evita que un turno largo se
    // congele en una sola.
    const { result } = renderHook(() => useStatusSequence(ChatStatus.Thinking, true, () => 0));

    expect(result.current).toBe(ChatStatus.Thinking);
    advance(STEP_MS);
    expect(result.current).toBe(ChatStatus.Reasoning);
    advance(STEP_MS);
    expect(result.current).toBe(ChatStatus.Thinking);
  });

  test("the idle pair can START on either word — that is the point of the random", () => {
    const { result } = renderHook(() => useStatusSequence(ChatStatus.Thinking, true, () => 0.99));

    expect(result.current).toBe(ChatStatus.Reasoning);
  });

  test("a reasoning turn behaves like a thinking one (same wait, two words)", () => {
    const { result } = renderHook(() => useStatusSequence(ChatStatus.Reasoning, true, () => 0));

    expect(result.current).toBe(ChatStatus.Thinking);
    advance(STEP_MS);
    expect(result.current).toBe(ChatStatus.Reasoning);
  });

  test("stops advancing while the indicator is hidden", () => {
    // Sin esto quedarían timers corriendo detrás de una línea que nadie ve.
    const { result } = renderHook(() => useStatusSequence(ChatStatus.Searching, false));

    advance(STEP_MS);
    advance(STEP_MS);

    expect(result.current).toBe(ChatStatus.Searching);
  });

  test("restarts the sequence when the backend switches to a search mid-turn", () => {
    const { result, rerender } = renderHook(
      ({ status }: { status: ChatStatus }) => useStatusSequence(status, true, () => 0),
      { initialProps: { status: ChatStatus.Thinking } },
    );
    advance(STEP_MS); // ya está en «Razonando…»

    rerender({ status: ChatStatus.Searching });

    expect(result.current).toBe(ChatStatus.Searching);
  });
});
