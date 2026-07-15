import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useAdminList } from "./use-admin-list";

describe("useAdminList", () => {
  it("starts from the SSR initial rows", () => {
    const { result } = renderHook(() => useAdminList(["a", "b"], vi.fn()));
    expect(result.current.items).toEqual(["a", "b"]);
  });

  it("re-syncs when the SSR `initial` prop changes (navegación: paginación/filtro/orden)", () => {
    // Regresión: `useState(initial)` congela las filas en la primera página → paginar no cambiaba
    // nada. Al reejecutar `data()`, `useData()` trae un array nuevo y la lista DEBE reflejarlo.
    const { result, rerender } = renderHook(({ rows }) => useAdminList(rows, vi.fn()), {
      initialProps: { rows: ["page1-a", "page1-b"] },
    });
    expect(result.current.items).toEqual(["page1-a", "page1-b"]);

    rerender({ rows: ["page2-c", "page2-d"] });

    expect(result.current.items).toEqual(["page2-c", "page2-d"]);
  });

  it("does NOT clobber refreshed items when `initial` keeps the same reference", async () => {
    // Tras una mutación, `refresh()` reemplaza con lo fetcheado client-side; mientras la data SSR
    // (`initial`) no cambie de referencia, un re-render no debe pisar ese resultado.
    const stable = ["x", "y"];
    const fetcher = vi.fn().mockResolvedValue(["refreshed"]);
    const { result, rerender } = renderHook(({ rows }) => useAdminList(rows, fetcher), {
      initialProps: { rows: stable },
    });

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.items).toEqual(["refreshed"]);

    rerender({ rows: stable }); // misma referencia → no re-sincroniza
    expect(result.current.items).toEqual(["refreshed"]);
  });
});
