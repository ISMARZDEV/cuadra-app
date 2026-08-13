import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type TypeaheadResult = {
  data: { id: string; slug: string; name: string; brand: string }[] | undefined;
  isFetching: boolean;
};
const { useProductTypeahead, useDraftCompletions } = vi.hoisted(() => ({
  useProductTypeahead: vi.fn(),
  useDraftCompletions: vi.fn(() => ({ data: [], isFetching: false })),
}));
const mockTypeahead = (result: TypeaheadResult) => useProductTypeahead.mockReturnValue(result);
vi.mock("../api", () => ({ useProductTypeahead, useDraftCompletions }));

import { setLanguage } from "@/i18n";
import { useSuggestionUsageStore } from "@/store/suggestion-usage-store";
import { QueryWrapper } from "@/test/query-wrapper";

import { QuickActions } from "./quick-actions";

const SUGGESTIONS_ES = [
  "¿Cuánto gasté este mes 📅?",
  "Quiero registrar un ingreso 📈📊",
  "¿Cuánto dinero tengo disponible 💸?",
  "Ayúdame con la lista de compras 🛒🛍️",
  "¿Cómo va mi presupuesto 🎯?",
  "¿En qué gasto más 📊?",
  "Compara precios de un producto 🔍🏷️",
  "Dame un consejo para ahorrar 💡🐖",
];

const pillLabels = () =>
  screen.getAllByRole("button").map((el) => el.getAttribute("aria-label"));

describe("QuickActions", () => {
  beforeEach(() => {
    setLanguage("es");
    useSuggestionUsageStore.setState({ usage: {}, restored: true });
    mockTypeahead({ data: [], isFetching: false });
  });
  afterEach(() => vi.useRealTimers());

  test("renders the eight localized suggestion chips", () => {
    render(<QuickActions onSelect={vi.fn()} />, { wrapper: QueryWrapper });

    for (const label of SUGGESTIONS_ES) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  test("tapping a chip sends its prompt", () => {
    const onSelect = vi.fn();
    render(<QuickActions onSelect={onSelect} />, { wrapper: QueryWrapper });

    fireEvent.click(screen.getByText("¿Cuánto gasté este mes 📅?"));

    expect(onSelect).toHaveBeenCalledWith("¿Cuánto gasté este mes 📅?");
  });

  // Tocar una sugerencia dispara un envío al chat, que es IRREVERSIBLE: un doble toque nervioso
  // mandaría el mismo mensaje dos veces. El dock tarda en cerrarse (mantiene los hijos montados
  // hasta que el resorte asienta, chat-dock.tsx), así que la segunda pulsación SÍ llega — el
  // componente tiene que rechazarla por su cuenta.
  test("a double tap sends the prompt only once", () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    render(<QuickActions onSelect={onSelect} />, { wrapper: QueryWrapper });
    const chip = screen.getByText("¿Cuánto gasté este mes 📅?");

    fireEvent.click(chip);
    fireEvent.click(chip);

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  // Lo que el usuario más manda, primero. El orden lo calcula `use-suggestions` y se prueba en
  // detalle allá; acá se verifica lo único que ese test no puede ver: que el carrusel realmente
  // PINTE ese orden en vez de recorrer el catálogo por su cuenta.
  test("shows the most-sent suggestions first", () => {
    useSuggestionUsageStore.setState({
      usage: { "chat.quickActions.savingTip": 7, "chat.quickActions.compareProduct": 3 },
      restored: true,
    });

    render(<QuickActions onSelect={vi.fn()} />, { wrapper: QueryWrapper });

    expect(pillLabels().slice(0, 2)).toEqual([
      "Dame un consejo para ahorrar 💡🐖",
      "Compara precios de un producto 🔍🏷️",
    ]);
  });

  // El historial se cuenta por CLAVE i18n, nunca por el texto: contando el texto, el mismo usuario
  // tendría un historial distinto por idioma y el orden se reiniciaría al cambiar de es a en.
  test("counts a sent suggestion by its i18n key, not its rendered text", async () => {
    render(<QuickActions onSelect={vi.fn()} />, { wrapper: QueryWrapper });

    fireEvent.click(screen.getByText("¿Cuánto gasté este mes 📅?"));
    await vi.waitFor(() =>
      expect(useSuggestionUsageStore.getState().usage).toEqual({
        "chat.quickActions.spentThisMonth": 1,
      }),
    );
  });

  // La costura entre el borrador y el carrusel. La lógica de la cascada se prueba en detalle en
  // use-live-suggestions.test.ts; lo que ESTE test cubre es lo único que aquel no puede ver: que
  // el `draft` que baja por props llegue de verdad al hook (olvidarse de pasarlo compila igual).
  test("swaps the pills for the product being typed", () => {
    vi.useFakeTimers();
    mockTypeahead({
      data: [{ id: "1", slug: "g", name: "Guandules Verdes Goya", brand: "Goya" }],
      isFetching: false,
    });

    render(<QuickActions onSelect={vi.fn()} draft="Donde estan los guan" />, {
      wrapper: QueryWrapper,
    });
    act(() => vi.advanceTimersByTime(300)); // el debounce

    expect(
      screen.getByText("¿Dónde está el mejor precio de Guandules Verdes Goya?"),
    ).toBeInTheDocument();
    expect(screen.queryByText("¿Cuánto gasté este mes 📅?")).toBeNull();
  });

  // El esqueleto REEMPLAZA a la lista en vez de superponerse, y eso es lo que hace que el Canvas
  // de Skia se DESMONTE al terminar: su reloj late mientras esté montado, y ocultarlo por opacidad
  // no lo detendría (la lección de orb-sphere.tsx).
  test("replaces the pills with the skeleton while the catalog resolves", () => {
    vi.useFakeTimers();
    mockTypeahead({ data: undefined, isFetching: true });

    render(<QuickActions onSelect={vi.fn()} draft="guandules" />, { wrapper: QueryWrapper });
    act(() => vi.advanceTimersByTime(300));

    expect(screen.queryByRole("button")).toBeNull();
  });

  // El bloqueo es una ventana, no un candado permanente: pasado el tiempo de guarda el carrusel
  // vuelve a responder (importa porque el dock puede seguir abierto si el envío falla).
  test("accepts a new tap once the guard window has elapsed", () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    render(<QuickActions onSelect={onSelect} />, { wrapper: QueryWrapper });
    const chip = screen.getByText("¿Cuánto gasté este mes 📅?");

    fireEvent.click(chip);
    vi.advanceTimersByTime(1000);
    fireEvent.click(chip);

    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});
