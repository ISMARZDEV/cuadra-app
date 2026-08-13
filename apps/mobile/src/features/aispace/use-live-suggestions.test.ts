import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn() }));

const { useProductTypeahead, useDraftCompletions } = vi.hoisted(() => ({
  useProductTypeahead: vi.fn(),
  useDraftCompletions: vi.fn(),
}));
vi.mock("./api", () => ({ useProductTypeahead, useDraftCompletions }));

import { setLanguage } from "@/i18n";
import { useSuggestionUsageStore } from "@/store/suggestion-usage-store";

import { buildProductSuggestions, typeaheadQuery, useLiveSuggestions } from "./use-live-suggestions";

describe("typeaheadQuery", () => {
  // Se busca la ÚLTIMA PALABRA, no la frase entera, y el motivo es cómo funciona el backend:
  // `word_similarity(query, name)` exige que TODO el conjunto de trigramas de la query calce
  // contra un tramo CONTIGUO del nombre. Mandarle "Donde estan los guan" contra
  // "Guandules Verdes Goya" puntúa cerca de cero — las palabras de relleno arrastran el puntaje
  // al piso. Con "guan" suelto, calza.
  test("takes the word being typed, not the whole phrase", () => {
    expect(typeaheadQuery("Donde estan los guan")).toBe("guan");
  });

  test("ignores trailing whitespace so a finished word still searches", () => {
    expect(typeaheadQuery("quiero guandules  ")).toBe("guandules");
  });

  test("stays quiet below three characters — two letters match half the catalog", () => {
    expect(typeaheadQuery("Donde estan los gu")).toBe("");
    expect(typeaheadQuery("")).toBe("");
  });

  test("lowercases so the cache key does not fragment by capitalization", () => {
    expect(typeaheadQuery("Guandules")).toBe("guandules");
  });
});

describe("buildProductSuggestions", () => {
  beforeEach(() => setLanguage("es"));

  test("slots the real product name into every template", () => {
    const items = buildProductSuggestions("Guandules Verdes Goya");

    expect(items.map((i) => i.label)).toEqual([
      "¿Dónde está el mejor precio de Guandules Verdes Goya?",
      "¿Cuánto cuesta Guandules Verdes Goya?",
      "Compara precios de Guandules Verdes Goya",
    ]);
  });

  // "Guandules Verdes Goya" es masculino plural — "los ... más baratos" concordaba con él DE
  // CASUALIDAD, y ese acuerdo escondió el bug real hasta que apareció un producto femenino
  // singular. Ningún template puede exigir concordancia de género/número con `{product}`: es un
  // string arbitrario del catálogo, no algo que el template pueda anticipar.
  test("stays grammatically correct for a product of a DIFFERENT gender and number", () => {
    const items = buildProductSuggestions("Crema Coco La Famosa 15 Oz");

    expect(items[0].label).toBe("¿Dónde está el mejor precio de Crema Coco La Famosa 15 Oz?");
  });

  // El contador de popularidad se lleva por PLANTILLA, no por producto: "¿cuánto cuesta X?" es el
  // mismo hábito sin importar si X fue arroz o guandules. Contar por producto haría un historial
  // con un uso por cada cosa que el usuario buscó una vez, y nada ascendería nunca.
  test("counts usage by template, not by product", () => {
    const items = buildProductSuggestions("Arroz Selecto");

    expect(items.map((i) => i.usageKey)).toEqual([
      "chat.suggest.whereCheapest",
      "chat.suggest.howMuch",
      "chat.suggest.compare",
    ]);
  });

  test("gives each pill an id that changes with the product", () => {
    const ids = (p: string) => buildProductSuggestions(p).map((i) => i.id);

    expect(ids("Arroz")).not.toEqual(ids("Guandules"));
  });
});

describe("useLiveSuggestions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setLanguage("es");
    useSuggestionUsageStore.setState({ usage: {}, restored: true });
    useProductTypeahead.mockReturnValue({ data: [], isFetching: false });
    useDraftCompletions.mockReturnValue({ data: [], isFetching: false });
  });
  afterEach(() => vi.useRealTimers());

  test("falls back to the static catalog while the draft is empty", () => {
    const { result } = renderHook(() => useLiveSuggestions(""));

    expect(result.current.items).toHaveLength(8);
    expect(result.current.items[0].usageKey).toMatch(/^chat\.quickActions\./);
    expect(result.current.isResolving).toBe(false);
  });

  test("swaps in product suggestions once the catalog answers", () => {
    useProductTypeahead.mockReturnValue({
      data: [{ id: "1", slug: "g", name: "Guandules Verdes Goya", brand: "Goya" }],
      isFetching: false,
    });

    const { result } = renderHook(() => useLiveSuggestions("Donde estan los guan"));
    act(() => vi.advanceTimersByTime(300));

    expect(result.current.items.map((i) => i.label)).toEqual([
      "¿Dónde está el mejor precio de Guandules Verdes Goya?",
      "¿Cuánto cuesta Guandules Verdes Goya?",
      "Compara precios de Guandules Verdes Goya",
    ]);
  });

  // Que el catálogo no conozca la palabra NO es un error: "cuánto gasté este mes" no es un
  // producto. Se vuelve al catálogo estático en vez de dejar el carrusel vacío.
  test("keeps the static catalog when nothing matches", () => {
    useProductTypeahead.mockReturnValue({ data: [], isFetching: false });

    const { result } = renderHook(() => useLiveSuggestions("cuanto gaste este mes"));
    act(() => vi.advanceTimersByTime(300));

    expect(result.current.items).toHaveLength(8);
  });

  test("reports that it is resolving so the pills can shimmer", () => {
    useProductTypeahead.mockReturnValue({ data: undefined, isFetching: true });

    const { result } = renderHook(() => useLiveSuggestions("guandules"));
    act(() => vi.advanceTimersByTime(300));

    expect(result.current.isResolving).toBe(true);
  });

  test("does not query the catalog for a two-letter fragment", () => {
    renderHook(() => useLiveSuggestions("gu"));
    act(() => vi.advanceTimersByTime(300));

    expect(useProductTypeahead).toHaveBeenLastCalledWith("");
  });

  // ── T2 · el nivel que CUESTA ────────────────────────────────────────────────
  describe("the LLM tier", () => {
    // EL TEST QUE PAGA LA ARQUITECTURA. Si el catálogo ya resolvió la palabra, preguntarle a un
    // modelo es gastar tokens por una respuesta que ya teníamos. La cascada existe para esto.
    test("is NEVER asked when the catalog already answered", () => {
      useProductTypeahead.mockReturnValue({
        data: [{ id: "1", slug: "g", name: "Guandules Verdes Goya", brand: "Goya" }],
        isFetching: false,
      });

      renderHook(() => useLiveSuggestions("Donde estan los guan"));
      act(() => vi.advanceTimersByTime(1000));

      expect(useDraftCompletions).toHaveBeenLastCalledWith("");
    });

    // «cuánto gasté este mes» NO es un producto: el catálogo no puede verlo por definición. Ese es
    // exactamente el hueco que T2 viene a tapar.
    test("takes over when the catalog knows nothing", () => {
      useProductTypeahead.mockReturnValue({ data: [], isFetching: false });
      useDraftCompletions.mockReturnValue({
        data: ["¿Cuánto gasté este mes?", "¿En qué gasté más?"],
        isFetching: false,
      });

      const { result } = renderHook(() => useLiveSuggestions("cuanto gaste"));
      act(() => vi.advanceTimersByTime(1000));

      expect(result.current.items.map((i) => i.label)).toEqual([
        "¿Cuánto gasté este mes?",
        "¿En qué gasté más?",
      ]);
    });

    // Espera MÁS que el catálogo: una llamada al modelo cuesta, así que sólo se hace cuando el
    // usuario de verdad se detuvo — no en la pausa de quien está pensando la palabra siguiente.
    test("waits longer than the catalog before spending a token", () => {
      renderHook(() => useLiveSuggestions("cuanto gaste"));

      act(() => vi.advanceTimersByTime(300)); // el catálogo ya salió…
      expect(useProductTypeahead).toHaveBeenLastCalledWith("gaste");
      expect(useDraftCompletions).toHaveBeenLastCalledWith(""); // …el modelo todavía no

      act(() => vi.advanceTimersByTime(400)); // pasada la pausa larga, ahora sí
      expect(useDraftCompletions).toHaveBeenLastCalledWith("cuanto gaste");
    });

    test("its usage is counted under one key, not per generated phrase", () => {
      useDraftCompletions.mockReturnValue({ data: ["¿Cuánto gasté este mes?"], isFetching: false });

      const { result } = renderHook(() => useLiveSuggestions("cuanto gaste"));
      act(() => vi.advanceTimersByTime(1000));

      expect(result.current.items[0].usageKey).toBe("chat.suggest.completion");
    });

    test("falls back to the static catalog when the model returns nothing either", () => {
      useDraftCompletions.mockReturnValue({ data: [], isFetching: false });

      const { result } = renderHook(() => useLiveSuggestions("xyzzy plugh"));
      act(() => vi.advanceTimersByTime(1000));

      expect(result.current.items).toHaveLength(8);
    });

    test("shimmers while the model is thinking", () => {
      useDraftCompletions.mockReturnValue({ data: undefined, isFetching: true });

      const { result } = renderHook(() => useLiveSuggestions("cuanto gaste"));
      act(() => vi.advanceTimersByTime(1000));

      expect(result.current.isResolving).toBe(true);
    });
  });
});
