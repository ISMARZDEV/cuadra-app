import type { AdminReviewQueueRowDto } from "@cuadra/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReviewQueueData } from "../types";

// Batch 6 — cobertura del restyle: header con el total, filtro client-side por nombre (toolbar),
// paginación numerada (Select de "por página" + botones de página), y el "Eliminar" del menú
// Acciones por fila (reusa el flujo de bulk-reject con UNA sola fila seleccionada). Mismo patrón de
// mocks que los otros tests de esta pantalla.
let mockData: ReviewQueueData;
vi.mock("vike-react/useData", () => ({ useData: () => mockData }));
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: "/admin/review-queue" }),
}));
const navigateMock = vi.fn();
vi.mock("vike/client/router", () => ({ navigate: (...args: unknown[]) => navigateMock(...args) }));

const bulkResolveReviewMatches = vi.fn();
const fetchTopCandidateId = vi.fn();
const fetchReviewQueue = vi.fn();
// La celda de Categoría y la acción "Clasificar" también viven en `../api`: el mock del módulo es
// TOTAL (no parcial), así que omitir un export rompe el import del screen, no solo la llamada.
const setStoreProductCategory = vi.fn().mockResolvedValue(true);
const classifySelected = vi.fn().mockResolvedValue(null);
const createCanonicalsFromSelection = vi.fn().mockResolvedValue(null);
vi.mock("../api", () => ({
  setStoreProductCategory: (...args: unknown[]) => setStoreProductCategory(...args),
  classifySelected: (...args: unknown[]) => classifySelected(...args),
  createCanonicalsFromSelection: (...args: unknown[]) => createCanonicalsFromSelection(...args),
  bulkResolveReviewMatches: (...args: unknown[]) => bulkResolveReviewMatches(...args),
  fetchTopCandidateId: (...args: unknown[]) => fetchTopCandidateId(...args),
  fetchReviewQueue: (...args: unknown[]) => fetchReviewQueue(...args),
}));

import { ReviewQueueListScreen } from "./ReviewQueueListScreen";

function row(overrides: Partial<AdminReviewQueueRowDto>): AdminReviewQueueRowDto {
  return {
    match_id: "m1",
    store_product_id: "sp1",
    confidence: 0.5,
    method: "vector",
    provider_id: "p1",
    provider_name: "Merca",
    store_product_name: "Arroz La Garza",
    store_product_brand: "La Garza",
    store_product_size_text: "10 LB",
    candidate_count: 3,
    created_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("ReviewQueueListScreen — restyle Batch 6", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    bulkResolveReviewMatches.mockReset();
    fetchTopCandidateId.mockReset();
    fetchReviewQueue.mockReset();
    fetchReviewQueue.mockResolvedValue({ rows: [], total: 0 });
  });

  it("shows the total count next to the title", () => {
    mockData = {
      rows: [row({ match_id: "m1" }), row({ match_id: "m2", store_product_name: "Aceite Mazorca" })],
      total: 52,
      params: { market: "DO", order_by: "uncertainty", limit: 10, offset: 0 },
    };

    render(<ReviewQueueListScreen />);
    expect(screen.getByText("(52)")).toBeInTheDocument();
  });

  it("filters the loaded rows client-side by product name via the toolbar search", () => {
    mockData = {
      rows: [
        row({ match_id: "m1", store_product_name: "Arroz La Garza" }),
        row({ match_id: "m2", store_product_name: "Aceite Mazorca" }),
      ],
      total: 2,
      params: { market: "DO", order_by: "uncertainty", limit: 50, offset: 0 },
    };

    render(<ReviewQueueListScreen />);
    expect(screen.getAllByTestId("review-row-name")).toHaveLength(2);

    fireEvent.change(screen.getByPlaceholderText("Buscar producto..."), {
      target: { value: "aceite" },
    });

    const names = screen.getAllByTestId("review-row-name").map((el) => el.textContent);
    expect(names).toEqual(["Aceite Mazorca"]);
  });

  it("changing 'por página' navigates with the new limit", () => {
    mockData = {
      rows: [row({ match_id: "m1" })],
      total: 52,
      params: { market: "DO", order_by: "uncertainty", limit: 10, offset: 0 },
    };

    render(<ReviewQueueListScreen />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "20" }));

    expect(navigateMock).toHaveBeenCalledWith("/admin/review-queue?limit=20");
  });

  it("clicking a numbered page navigates with the matching offset", () => {
    mockData = {
      rows: [row({ match_id: "m1" })],
      total: 52,
      params: { market: "DO", order_by: "uncertainty", limit: 10, offset: 0 },
    };

    render(<ReviewQueueListScreen />);
    fireEvent.click(screen.getByRole("button", { name: "3" }));

    // `limit=10` es el default → se omite de la URL (link limpio); solo viaja el offset.
    expect(navigateMock).toHaveBeenCalledWith("/admin/review-queue?offset=20");
  });

  it("clicking a sortable column header cycles none → asc → desc → default (order_by con prefijo '-')", () => {
    const base = { market: "DO" as const, limit: 10, offset: 0 };
    mockData = { rows: [row({ match_id: "m1" })], total: 3, params: { ...base, order_by: "uncertainty" } };
    const { rerender } = render(<ReviewQueueListScreen />);

    // none → asc: manda la columna sola (`name`)
    fireEvent.click(screen.getByRole("button", { name: "Producto" }));
    expect(navigateMock).toHaveBeenCalledWith("/admin/review-queue?order_by=name");

    // asc → desc: prefijo "-"
    navigateMock.mockClear();
    mockData = { ...mockData, params: { ...base, order_by: "name" } };
    rerender(<ReviewQueueListScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Producto" }));
    expect(navigateMock).toHaveBeenCalledWith("/admin/review-queue?order_by=-name");

    // desc → default: vuelve a `uncertainty` → se omite de la URL (link limpio)
    navigateMock.mockClear();
    mockData = { ...mockData, params: { ...base, order_by: "-name" } };
    rerender(<ReviewQueueListScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Producto" }));
    expect(navigateMock).toHaveBeenCalledWith("/admin/review-queue");
  });

  it("re-renders the table with the NEW rows after navigation delivers fresh SSR data (paginación real)", () => {
    // Reproduce el ciclo vivo que el usuario reportó roto: cambiar "por página"/página hace
    // `navigate()`, Vike reejecuta `data()` y `useData()` entrega filas NUEVAS. La tabla DEBE
    // reflejarlas. Antes del fix de `useAdminList` (que congelaba `useState(initial)`), esto
    // renderizaba las filas de la primera página para siempre.
    mockData = {
      rows: [row({ match_id: "p1a", store_product_name: "Producto Pagina 1" })],
      total: 30,
      params: { market: "DO", order_by: "uncertainty", limit: 10, offset: 0 },
    };
    const { rerender } = render(<ReviewQueueListScreen />);
    expect(screen.getByText("Producto Pagina 1")).toBeInTheDocument();

    // Simula el resultado de `navigate(?limit=20)`: `useData()` ahora devuelve otras filas.
    mockData = {
      rows: [
        row({ match_id: "p2a", store_product_name: "Producto Pagina 2 A" }),
        row({ match_id: "p2b", store_product_name: "Producto Pagina 2 B" }),
      ],
      total: 30,
      params: { market: "DO", order_by: "uncertainty", limit: 20, offset: 0 },
    };
    rerender(<ReviewQueueListScreen />);

    expect(screen.queryByText("Producto Pagina 1")).not.toBeInTheDocument();
    expect(screen.getByText("Producto Pagina 2 A")).toBeInTheDocument();
    expect(screen.getByText("Producto Pagina 2 B")).toBeInTheDocument();
  });

  it("'Eliminar' on a row's Acciones menu selects only that row and opens the reject panel", async () => {
    bulkResolveReviewMatches.mockResolvedValue({ succeeded: ["m2"], failed: [] });
    mockData = {
      rows: [row({ match_id: "m1" }), row({ match_id: "m2", store_product_name: "Aceite Mazorca" })],
      total: 2,
      params: { market: "DO", order_by: "uncertainty", limit: 50, offset: 0 },
    };

    render(<ReviewQueueListScreen />);

    const menuButtons = screen.getAllByLabelText("Más acciones");
    fireEvent.click(menuButtons[1]);
    fireEvent.click(screen.getByText("Eliminar"));

    expect(screen.getByTestId("bulk-reject-panel")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("reason-code-select"), {
      target: { value: "different_product" },
    });
    fireEvent.click(screen.getByTestId("reject-submit"));

    await waitFor(() => expect(bulkResolveReviewMatches).toHaveBeenCalledTimes(1));
    expect(bulkResolveReviewMatches).toHaveBeenCalledWith([
      { matchId: "m2", canonicalProductId: null, decidedBy: "admin", reasonCode: "different_product", reasonNote: undefined },
    ]);
  });
});
