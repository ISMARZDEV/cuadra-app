import type { BasketQueryDto } from "@cuadra/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BasketQueriesData } from "../interfaces";

// Mismo patrón de mocks que `save-sources/SourcesScreen.test.tsx`: la pantalla lee vía `useData`
// y las mutaciones se aíslan mockeando `../api` (nunca la red real).
let mockData: BasketQueriesData;
vi.mock("vike-react/useData", () => ({ useData: () => mockData }));

const createBasketQueryEntry = vi.fn();
const updateBasketQueryEntry = vi.fn();
const removeBasketQueryEntry = vi.fn();
const listBasketQueryEntries = vi.fn();
vi.mock("../api", () => ({
  createBasketQueryEntry: (...args: unknown[]) => createBasketQueryEntry(...args),
  updateBasketQueryEntry: (...args: unknown[]) => updateBasketQueryEntry(...args),
  removeBasketQueryEntry: (...args: unknown[]) => removeBasketQueryEntry(...args),
  listBasketQueryEntries: (...args: unknown[]) => listBasketQueryEntries(...args),
}));

import { BasketEditorScreen } from "./BasketEditorScreen";

function entry(overrides: Partial<BasketQueryDto>): BasketQueryDto {
  return {
    id: "q1",
    market_id: "DO",
    category_label: "Lácteos",
    query_text: "leche entera",
    position: 1,
    active: true,
    ...overrides,
  };
}

describe("BasketEditorScreen", () => {
  beforeEach(() => {
    createBasketQueryEntry.mockReset();
    updateBasketQueryEntry.mockReset();
    removeBasketQueryEntry.mockReset();
    listBasketQueryEntries.mockReset();
    listBasketQueryEntries.mockResolvedValue([]);
  });

  it("lists the curated queries grouped by category_label", () => {
    mockData = {
      entries: [
        entry({ id: "q1", category_label: "Lácteos", query_text: "leche entera" }),
        entry({ id: "q2", category_label: "Granos", query_text: "arroz blanco" }),
      ],
    };
    render(<BasketEditorScreen />);
    expect(screen.getByText("Lácteos")).toBeInTheDocument();
    expect(screen.getByText("Granos")).toBeInTheDocument();
    expect(screen.getByDisplayValue("leche entera")).toBeInTheDocument();
    expect(screen.getByDisplayValue("arroz blanco")).toBeInTheDocument();
  });

  it("shows the empty state when there are no queries yet", () => {
    mockData = { entries: [] };
    render(<BasketEditorScreen />);
    expect(screen.getByText("Sin queries todavía.")).toBeInTheDocument();
  });

  it("filters rows by search text", () => {
    mockData = {
      entries: [
        entry({ id: "q1", query_text: "leche entera" }),
        entry({ id: "q2", query_text: "arroz blanco" }),
      ],
    };
    render(<BasketEditorScreen />);
    fireEvent.change(screen.getByLabelText("Buscar en la canasta"), {
      target: { value: "arroz" },
    });
    expect(screen.queryByDisplayValue("leche entera")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("arroz blanco")).toBeInTheDocument();
  });

  it("adds a new query from the form, refetches the list locally (no reload) and shows the new row", async () => {
    mockData = { entries: [] };
    createBasketQueryEntry.mockResolvedValue({ ok: true, entry: entry({ id: "q9" }) });
    listBasketQueryEntries.mockResolvedValue([
      entry({ id: "q9", query_text: "leche deslactosada", category_label: "Lácteos" }),
    ]);
    render(<BasketEditorScreen />);

    fireEvent.change(screen.getByLabelText("Categoría (alta)"), { target: { value: "Lácteos" } });
    fireEvent.change(screen.getByLabelText("Query (alta)"), {
      target: { value: "leche deslactosada" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Agregar query" }));

    await waitFor(() =>
      expect(createBasketQueryEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          marketId: "DO",
          queryText: "leche deslactosada",
          categoryLabel: "Lácteos",
        }),
      ),
    );
    await waitFor(() => expect(listBasketQueryEntries).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByDisplayValue("leche deslactosada")).toBeInTheDocument(),
    );
  });

  it("shows the duplicate message on a 409 without crashing, and does not refetch", async () => {
    mockData = { entries: [] };
    createBasketQueryEntry.mockResolvedValue({
      ok: false,
      kind: "duplicate",
      message: "esa query ya existe en la canasta.",
    });
    render(<BasketEditorScreen />);

    fireEvent.change(screen.getByLabelText("Query (alta)"), { target: { value: "leche entera" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar query" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("ya existe en la canasta"),
    );
    expect(listBasketQueryEntries).not.toHaveBeenCalled();
  });

  it("toggles active via the api wrapper and refetches locally (no reload)", async () => {
    mockData = { entries: [entry({ id: "q1", active: true })] };
    updateBasketQueryEntry.mockResolvedValue({ data: entry({ id: "q1", active: false }) });
    listBasketQueryEntries.mockResolvedValue([entry({ id: "q1", active: false })]);
    render(<BasketEditorScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Desactivar q1" }));

    await waitFor(() =>
      expect(updateBasketQueryEntry).toHaveBeenCalledWith("q1", expect.objectContaining({ active: false })),
    );
    await waitFor(() => expect(listBasketQueryEntries).toHaveBeenCalled());
  });

  it("edits query_text inline via the api wrapper and refetches locally (no reload)", async () => {
    mockData = { entries: [entry({ id: "q1", query_text: "leche entera" })] };
    updateBasketQueryEntry.mockResolvedValue({ data: entry({ id: "q1", query_text: "leche light" }) });
    listBasketQueryEntries.mockResolvedValue([entry({ id: "q1", query_text: "leche light" })]);
    render(<BasketEditorScreen />);

    fireEvent.change(screen.getByDisplayValue("leche entera"), {
      target: { value: "leche light" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar q1" }));

    await waitFor(() =>
      expect(updateBasketQueryEntry).toHaveBeenCalledWith(
        "q1",
        expect.objectContaining({ queryText: "leche light" }),
      ),
    );
    await waitFor(() => expect(listBasketQueryEntries).toHaveBeenCalled());
  });

  it("deletes a query only after confirming (hard remove needs a confirm step), then refetches locally", async () => {
    mockData = { entries: [entry({ id: "q1", query_text: "leche entera" })] };
    removeBasketQueryEntry.mockResolvedValue({});
    listBasketQueryEntries.mockResolvedValue([]);
    render(<BasketEditorScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Eliminar q1" }));
    expect(removeBasketQueryEntry).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar eliminar q1" }));

    await waitFor(() => expect(removeBasketQueryEntry).toHaveBeenCalledWith("q1"));
    await waitFor(() => expect(listBasketQueryEntries).toHaveBeenCalled());
  });

  it("moving a middle row up swaps its position with the previous row via the api wrapper", async () => {
    mockData = {
      entries: [
        entry({ id: "q1", query_text: "leche entera", position: 1 }),
        entry({ id: "q2", query_text: "arroz blanco", position: 2 }),
        entry({ id: "q3", query_text: "azucar", position: 3 }),
      ],
    };
    updateBasketQueryEntry.mockResolvedValue({ data: {} });
    listBasketQueryEntries.mockResolvedValue(mockData.entries);
    render(<BasketEditorScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Subir q2" }));

    await waitFor(() => expect(updateBasketQueryEntry).toHaveBeenCalledTimes(2));
    expect(updateBasketQueryEntry).toHaveBeenCalledWith(
      "q2",
      expect.objectContaining({ position: 1 }),
    );
    expect(updateBasketQueryEntry).toHaveBeenCalledWith(
      "q1",
      expect.objectContaining({ position: 2 }),
    );
    await waitFor(() => expect(listBasketQueryEntries).toHaveBeenCalled());
  });

  it("disables (no-ops) the up button on the first row and the down button on the last row", () => {
    mockData = {
      entries: [
        entry({ id: "q1", query_text: "leche entera", position: 1 }),
        entry({ id: "q2", query_text: "arroz blanco", position: 2 }),
      ],
    };
    render(<BasketEditorScreen />);

    expect(screen.getByRole("button", { name: "Subir q1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar q2" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Subir q1" }));
    expect(updateBasketQueryEntry).not.toHaveBeenCalled();
  });
});
