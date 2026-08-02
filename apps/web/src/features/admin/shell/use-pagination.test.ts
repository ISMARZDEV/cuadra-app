import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { usePagination } from "./use-pagination";

const items = Array.from({ length: 42 }, (_, i) => i);

describe("usePagination", () => {
  it("corta la página vigente y reporta su rango", () => {
    const { result } = renderHook(() => usePagination(items));

    expect(result.current.pageRows).toHaveLength(10);
    expect(result.current.pageRows[0]).toBe(0);
    expect(result.current.from).toBe(1);
    expect(result.current.to).toBe(10);
    expect(result.current.totalPages).toBe(5);
  });

  it("con la lista vacía el rango arranca en 0, no en 1", () => {
    // `from = offset + 1` a secas mostraría "1–0 de 0", que se lee como si hubiera algo.
    const { result } = renderHook(() => usePagination([]));

    expect(result.current.from).toBe(0);
    expect(result.current.to).toBe(0);
    expect(result.current.totalPages).toBe(1);
  });

  it("cambiar el tamaño de página vuelve a la PRIMERA", () => {
    // Estar en la página 5 con tamaño 10 y pasar a 50 deja la tabla vacía: la 5 no existe.
    const { result } = renderHook(() => usePagination(items));

    act(() => result.current.goToPage(4));
    expect(result.current.currentPage).toBe(4);

    act(() => result.current.setLimit(50));
    expect(result.current.currentPage).toBe(1);
    expect(result.current.pageRows).toHaveLength(42);
  });

  it("la última página trae solo el resto", () => {
    const { result } = renderHook(() => usePagination(items));

    act(() => result.current.goToPage(5));

    expect(result.current.pageRows).toHaveLength(2);
    expect(result.current.from).toBe(41);
    expect(result.current.to).toBe(42);
  });

  it("inyecta el limit vigente en las opciones cuando no está en la lista fija", () => {
    // El backend manda 50 por defecto en algunas listas: sin esto el <Select> queda sin valor.
    const { result } = renderHook(() => usePagination(items, { defaultLimit: 33 }));

    expect(result.current.pageSizeOptions).toContain(33);
    expect([...result.current.pageSizeOptions]).toEqual(
      [...result.current.pageSizeOptions].sort((a, b) => a - b),
    );
  });

  it("`reset` vuelve a la primera página sin tocar el tamaño", () => {
    const { result } = renderHook(() => usePagination(items));

    act(() => result.current.goToPage(3));
    act(() => result.current.reset());

    expect(result.current.currentPage).toBe(1);
    expect(result.current.limit).toBe(10);
  });
});
