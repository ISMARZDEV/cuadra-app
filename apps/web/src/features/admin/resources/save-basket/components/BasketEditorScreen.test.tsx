import type { BasketQueryDto } from "@cuadra/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BasketQueriesData } from "../interfaces";

// La pantalla lee vía `useData`; las mutaciones se aíslan mockeando `../api` (nunca red real).
// REBUILD F2 (fiel a la Cola de Revisión): tabla con checkboxes, headers ordenables, paginación
// client-side, buscador-pill, y modal (FilterModal) para alta/edición. Las acciones por fila viven
// en un `DropdownMenu` (se abre con "Acciones <query>"; ítems con label LIMPIO, sin id).
let mockData: BasketQueriesData;
vi.mock("vike-react/useData", () => ({ useData: () => mockData }));

const createBasketQueryEntry = vi.fn();
const updateBasketQueryEntry = vi.fn();
const removeBasketQueryEntry = vi.fn();
const listBasketQueryEntries = vi.fn();
const previewBasketQueryTerm = vi.fn();
vi.mock("../api", () => ({
  createBasketQueryEntry: (...args: unknown[]) => createBasketQueryEntry(...args),
  updateBasketQueryEntry: (...args: unknown[]) => updateBasketQueryEntry(...args),
  removeBasketQueryEntry: (...args: unknown[]) => removeBasketQueryEntry(...args),
  listBasketQueryEntries: (...args: unknown[]) => listBasketQueryEntries(...args),
  previewBasketQueryTerm: (...args: unknown[]) => previewBasketQueryTerm(...args),
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

function openRowMenu(query: string) {
  fireEvent.click(screen.getByLabelText(`Acciones ${query}`));
}

describe("BasketEditorScreen (tabla fiel a Cola de Revisión)", () => {
  beforeEach(() => {
    createBasketQueryEntry.mockReset();
    updateBasketQueryEntry.mockReset();
    removeBasketQueryEntry.mockReset();
    listBasketQueryEntries.mockReset();
    listBasketQueryEntries.mockResolvedValue([]);
    previewBasketQueryTerm.mockReset();
    previewBasketQueryTerm.mockResolvedValue([]);
  });

  it("lists the curated queries with their category and query text", () => {
    mockData = {
      entries: [
        entry({ id: "q1", category_label: "Lácteos", query_text: "leche entera" }),
        entry({ id: "q2", category_label: "Granos", query_text: "arroz blanco" }),
      ],
    };
    render(<BasketEditorScreen />);
    expect(screen.getByText("Lácteos")).toBeInTheDocument();
    expect(screen.getByText("Granos")).toBeInTheDocument();
    expect(screen.getByText("leche entera")).toBeInTheDocument();
    expect(screen.getByText("arroz blanco")).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText("Buscar en la canasta"), { target: { value: "arroz" } });
    expect(screen.queryByText("leche entera")).not.toBeInTheDocument();
    expect(screen.getByText("arroz blanco")).toBeInTheDocument();
  });

  it("adds a new query from the modal, refetches locally (no reload) and shows the new row", async () => {
    mockData = { entries: [] };
    createBasketQueryEntry.mockResolvedValue({ ok: true, entry: entry({ id: "q9" }) });
    listBasketQueryEntries.mockResolvedValue([
      entry({ id: "q9", query_text: "leche deslactosada", category_label: "Lácteos" }),
    ]);
    render(<BasketEditorScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Agregar query" })); // abre el modal
    fireEvent.change(screen.getByLabelText("Query"), { target: { value: "leche deslactosada" } });
    fireEvent.change(screen.getByLabelText("Categoría"), { target: { value: "Lácteos" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear query" }));

    await waitFor(() =>
      expect(createBasketQueryEntry).toHaveBeenCalledWith(
        expect.objectContaining({ marketId: "DO", queryText: "leche deslactosada", categoryLabel: "Lácteos" }),
      ),
    );
    await waitFor(() => expect(listBasketQueryEntries).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("leche deslactosada")).toBeInTheDocument());
  });

  it("shows the duplicate message on a 409 in the modal without crashing, and does not refetch", async () => {
    mockData = { entries: [] };
    createBasketQueryEntry.mockResolvedValue({
      ok: false,
      kind: "duplicate",
      message: "esa query ya existe en la canasta.",
    });
    render(<BasketEditorScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Agregar query" }));
    fireEvent.change(screen.getByLabelText("Query"), { target: { value: "leche entera" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear query" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("ya existe en la canasta"));
    expect(listBasketQueryEntries).not.toHaveBeenCalled();
  });

  it("toggles active from the row actions menu and refetches locally (no reload)", async () => {
    mockData = { entries: [entry({ id: "q1", query_text: "leche entera", active: true })] };
    updateBasketQueryEntry.mockResolvedValue({ data: entry({ id: "q1", active: false }) });
    listBasketQueryEntries.mockResolvedValue([entry({ id: "q1", active: false })]);
    render(<BasketEditorScreen />);

    openRowMenu("leche entera");
    fireEvent.click(screen.getByText("Desactivar"));

    await waitFor(() =>
      expect(updateBasketQueryEntry).toHaveBeenCalledWith("q1", expect.objectContaining({ active: false })),
    );
    await waitFor(() => expect(listBasketQueryEntries).toHaveBeenCalled());
  });

  it("edits a query from the actions menu → modal (prefilled) → Guardar, then refetches", async () => {
    mockData = { entries: [entry({ id: "q1", query_text: "leche entera" })] };
    updateBasketQueryEntry.mockResolvedValue({ data: entry({ id: "q1", query_text: "leche light" }) });
    listBasketQueryEntries.mockResolvedValue([entry({ id: "q1", query_text: "leche light" })]);
    render(<BasketEditorScreen />);

    openRowMenu("leche entera");
    fireEvent.click(screen.getByText("Editar"));
    expect(screen.getByLabelText("Query")).toHaveValue("leche entera"); // prefilled
    fireEvent.change(screen.getByLabelText("Query"), { target: { value: "leche light" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(updateBasketQueryEntry).toHaveBeenCalledWith("q1", expect.objectContaining({ queryText: "leche light" })),
    );
    await waitFor(() => expect(listBasketQueryEntries).toHaveBeenCalled());
  });

  it("deletes a query only after confirming (hard remove needs a confirm step), then refetches", async () => {
    mockData = { entries: [entry({ id: "q1", query_text: "leche entera" })] };
    removeBasketQueryEntry.mockResolvedValue({});
    listBasketQueryEntries.mockResolvedValue([]);
    render(<BasketEditorScreen />);

    openRowMenu("leche entera");
    fireEvent.click(screen.getByText("Eliminar"));
    expect(removeBasketQueryEntry).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Confirmar eliminar leche entera"));

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

    fireEvent.click(screen.getByLabelText("Subir arroz blanco"));

    await waitFor(() => expect(updateBasketQueryEntry).toHaveBeenCalledTimes(2));
    expect(updateBasketQueryEntry).toHaveBeenCalledWith("q2", expect.objectContaining({ position: 1 }));
    expect(updateBasketQueryEntry).toHaveBeenCalledWith("q1", expect.objectContaining({ position: 2 }));
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

    expect(screen.getByLabelText("Subir leche entera")).toBeDisabled();
    expect(screen.getByLabelText("Bajar arroz blanco")).toBeDisabled();

    fireEvent.click(screen.getByLabelText("Subir leche entera"));
    expect(updateBasketQueryEntry).not.toHaveBeenCalled();
  });

  it("selects all and bulk-deletes the selected queries after confirming", async () => {
    mockData = {
      entries: [
        entry({ id: "q1", query_text: "leche entera" }),
        entry({ id: "q2", query_text: "arroz blanco" }),
      ],
    };
    removeBasketQueryEntry.mockResolvedValue({});
    listBasketQueryEntries.mockResolvedValue([]);
    render(<BasketEditorScreen />);

    fireEvent.click(screen.getByTestId("select-all"));
    fireEvent.click(screen.getByRole("button", { name: "Acciones" })); // dropdown bulk (no el th ni las filas)
    fireEvent.click(screen.getByText("Eliminar (2)"));
    fireEvent.click(screen.getByText("Confirmar eliminar (2)"));

    await waitFor(() => expect(removeBasketQueryEntry).toHaveBeenCalledTimes(2));
    expect(removeBasketQueryEntry).toHaveBeenCalledWith("q1");
    expect(removeBasketQueryEntry).toHaveBeenCalledWith("q2");
  });

  it("previews a term across stores from the add modal (dry-run, per-store results)", async () => {
    mockData = { entries: [] };
    previewBasketQueryTerm.mockResolvedValue([
      {
        provider_id: "p1",
        provider_name: "Sirena",
        entries: [
          { external_id: "sku1", name: "Arroz La Garza 10 Lb", brand: "La Garza", price_minor: 42400, currency: "DOP", url: "https://sirena.do/x/p", image_url: null },
        ],
        error: null,
      },
      { provider_id: "p2", provider_name: "Nacional", entries: [], error: "upstream caído" },
    ]);
    render(<BasketEditorScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Agregar query" }));
    fireEvent.change(screen.getByLabelText("Query"), { target: { value: "arroz la garza" } });
    fireEvent.click(screen.getByRole("button", { name: "Previsualizar en tiendas" }));

    await waitFor(() =>
      expect(previewBasketQueryTerm).toHaveBeenCalledWith("arroz la garza", "DO"),
    );
    await waitFor(() => expect(screen.getByText("Sirena")).toBeInTheDocument());
    expect(screen.getByText("Arroz La Garza 10 Lb")).toBeInTheDocument();
    expect(screen.getByText("Nacional")).toBeInTheDocument();
    expect(screen.getByText("upstream caído")).toBeInTheDocument(); // tienda con error, graceful
  });

  it("sorting by Query orders the visible rows ascending then descending", () => {
    mockData = {
      entries: [
        entry({ id: "q1", query_text: "banana" }),
        entry({ id: "q2", query_text: "arroz" }),
      ],
    };
    render(<BasketEditorScreen />);

    const queryHeader = screen.getByRole("button", { name: /Query/ });
    fireEvent.click(queryHeader); // asc
    const cellsAsc = screen.getAllByRole("cell").map((c) => c.textContent);
    expect(cellsAsc.join(" ").indexOf("arroz")).toBeLessThan(cellsAsc.join(" ").indexOf("banana"));
  });
});
