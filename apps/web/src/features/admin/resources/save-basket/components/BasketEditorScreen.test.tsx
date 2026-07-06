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
vi.mock("../api", () => ({
  createBasketQueryEntry: (...args: unknown[]) => createBasketQueryEntry(...args),
  updateBasketQueryEntry: (...args: unknown[]) => updateBasketQueryEntry(...args),
  removeBasketQueryEntry: (...args: unknown[]) => removeBasketQueryEntry(...args),
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
  const reloadMock = vi.fn();

  beforeEach(() => {
    createBasketQueryEntry.mockReset();
    updateBasketQueryEntry.mockReset();
    removeBasketQueryEntry.mockReset();
    reloadMock.mockReset();
    Object.defineProperty(window, "location", {
      value: { reload: reloadMock },
      writable: true,
    });
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

  it("adds a new query from the form and calls the api wrapper with its values", async () => {
    mockData = { entries: [] };
    createBasketQueryEntry.mockResolvedValue({ ok: true, entry: entry({ id: "q9" }) });
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
    expect(reloadMock).toHaveBeenCalled();
  });

  it("shows the duplicate message on a 409 without crashing, and does not reload", async () => {
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
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("toggles active via the api wrapper", async () => {
    mockData = { entries: [entry({ id: "q1", active: true })] };
    updateBasketQueryEntry.mockResolvedValue({ data: entry({ id: "q1", active: false }) });
    render(<BasketEditorScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Desactivar q1" }));

    await waitFor(() =>
      expect(updateBasketQueryEntry).toHaveBeenCalledWith("q1", expect.objectContaining({ active: false })),
    );
  });

  it("edits query_text inline via the api wrapper", async () => {
    mockData = { entries: [entry({ id: "q1", query_text: "leche entera" })] };
    updateBasketQueryEntry.mockResolvedValue({ data: entry({ id: "q1", query_text: "leche light" }) });
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
  });

  it("deletes a query only after confirming (hard remove needs a confirm step)", async () => {
    mockData = { entries: [entry({ id: "q1", query_text: "leche entera" })] };
    removeBasketQueryEntry.mockResolvedValue({});
    render(<BasketEditorScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Eliminar q1" }));
    expect(removeBasketQueryEntry).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar eliminar q1" }));

    await waitFor(() => expect(removeBasketQueryEntry).toHaveBeenCalledWith("q1"));
  });
});
