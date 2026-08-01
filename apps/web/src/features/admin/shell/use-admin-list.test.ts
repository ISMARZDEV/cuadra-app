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

  it("un fetcher que FALLA no vacía la tabla — el error no puede disfrazarse de lista vacía", async () => {
    // El bug: cuatro consolas hacían `res.data ?? []`, así que un fallo de red tras mutar dejaba
    // la tabla en "0 resultados", indistinguible de que de verdad no hubiera nada. El operador
    // concluía "no hay proveedores" cuando lo que hubo fue una petición caída.
    const fetcher = vi.fn().mockResolvedValue(null);
    // referencia ESTABLE: el hook re-sincroniza cuando `initial` cambia de referencia, así que
    // un literal inline se recrearía en cada render y entraría en bucle (en la app viene de `useData()`).
    const initial = ["a", "b"];
    const { result } = renderHook(() => useAdminList(initial, fetcher));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.refresh();
    });

    expect(ok).toBe(false);              // el llamador se entera y puede avisar
    expect(result.current.items).toEqual(["a", "b"]);  // y NO se pierde lo que había
  });

  it("un refresh correcto avisa que fue correcto", async () => {
    const fetcher = vi.fn().mockResolvedValue(["nuevo"]);
    const initial = ["viejo"];
    const { result } = renderHook(() => useAdminList(initial, fetcher));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.refresh();
    });

    expect(ok).toBe(true);
    expect(result.current.items).toEqual(["nuevo"]);
  });

  it("una lista VACÍA de verdad sí vacía la tabla (no se confunde con un fallo)", async () => {
    const fetcher = vi.fn().mockResolvedValue([]);
    const initial = ["a"];
    const { result } = renderHook(() => useAdminList(initial, fetcher));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.refresh();
    });

    expect(ok).toBe(true);
    expect(result.current.items).toEqual([]);
  });
});
