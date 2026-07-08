import type { AdminReviewQueueRowDto } from "@cuadra/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReviewQueueData } from "../types";

// Mismo patrón de mocks que `ReviewQueueListScreen.test.tsx` (useData/usePageContext/navigate),
// más el mock de `../api` para aislar las mutaciones de red (batch 2e, tasks 2.23/2.24): el bulk
// action NUNCA debe tragarse un fallo parcial — se testea que se muestra explícitamente.
//
// Batch 6: los botones "Aprobar (candidato top)"/"Rechazar seleccionados…" ya NO están sueltos en
// la pantalla — viven en el dropdown "Acciones" de `ReviewQueueToolbar` (mismo patrón ya probado
// en `ReviewQueueToolbar.test.tsx`: abrir el trigger, después buscar el item). Además, tras
// aplicar el resultado, la pantalla llama `refresh()` (`useAdminList`) en vez de
// `window.location.reload()` — se mockea `fetchReviewQueue` (usado por el fetcher de `useAdminList`)
// para que ese refresh no rompa el test.
let mockData: ReviewQueueData;
vi.mock("vike-react/useData", () => ({ useData: () => mockData }));
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: "/admin/review-queue" }),
}));
vi.mock("vike/client/router", () => ({ navigate: vi.fn() }));

const bulkResolveReviewMatches = vi.fn();
const fetchTopCandidateId = vi.fn();
const fetchReviewQueue = vi.fn();
vi.mock("../api", () => ({
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

describe("ReviewQueueListScreen bulk actions", () => {
  beforeEach(() => {
    bulkResolveReviewMatches.mockReset();
    fetchTopCandidateId.mockReset();
    fetchReviewQueue.mockReset();
    fetchReviewQueue.mockResolvedValue({ rows: [], total: 0 });
    mockData = {
      rows: [row({ match_id: "m1" }), row({ match_id: "m2", store_product_name: "Aceite Mazorca" })],
      total: 2,
      params: { market: "DO", order_by: "uncertainty", limit: 50, offset: 0 },
    };
  });

  it("bulk-rejects the selected rows in ONE batched call and surfaces partial failure (never silently dropped)", async () => {
    bulkResolveReviewMatches.mockResolvedValue({
      succeeded: ["m1"],
      failed: [{ match_id: "m2", error: "match ya resuelto" }],
    });

    render(<ReviewQueueListScreen />);

    fireEvent.click(screen.getByTestId("row-select-m1"));
    fireEvent.click(screen.getByTestId("row-select-m2"));
    fireEvent.click(screen.getByRole("button", { name: "Acciones" }));
    fireEvent.click(screen.getByText("Rechazar seleccionados"));

    // el submit está bloqueado sin motivo (mismo guard que el rechazo individual)
    fireEvent.click(screen.getByTestId("reject-submit"));
    expect(bulkResolveReviewMatches).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("reason-code-select"), {
      target: { value: "different_product" },
    });
    fireEvent.click(screen.getByTestId("reject-submit"));

    await waitFor(() => expect(bulkResolveReviewMatches).toHaveBeenCalledTimes(1));
    expect(bulkResolveReviewMatches).toHaveBeenCalledWith([
      { matchId: "m1", canonicalProductId: null, decidedBy: "admin", reasonCode: "different_product", reasonNote: undefined },
      { matchId: "m2", canonicalProductId: null, decidedBy: "admin", reasonCode: "different_product", reasonNote: undefined },
    ]);

    const result = await screen.findByTestId("bulk-result");
    expect(result.textContent).toMatch(/1/);
    const failures = screen.getAllByTestId("bulk-result-failure").map((el) => el.textContent);
    expect(failures).toEqual(["m2 — match ya resuelto"]);
  });

  it("bulk-approves via each row's top candidate and surfaces rows with no candidates as failures too", async () => {
    fetchTopCandidateId.mockImplementation(async (matchId: string) =>
      matchId === "m1" ? "canon-1" : null,
    );
    bulkResolveReviewMatches.mockResolvedValue({ succeeded: ["m1"], failed: [] });

    render(<ReviewQueueListScreen />);

    fireEvent.click(screen.getByTestId("row-select-m1"));
    fireEvent.click(screen.getByTestId("row-select-m2"));
    fireEvent.click(screen.getByRole("button", { name: "Acciones" }));
    fireEvent.click(screen.getByText("Aprobar seleccionados"));

    await waitFor(() => expect(fetchTopCandidateId).toHaveBeenCalledTimes(2));
    expect(fetchTopCandidateId).toHaveBeenCalledWith("m1");
    expect(fetchTopCandidateId).toHaveBeenCalledWith("m2");

    await waitFor(() => expect(bulkResolveReviewMatches).toHaveBeenCalledTimes(1));
    expect(bulkResolveReviewMatches).toHaveBeenCalledWith([
      { matchId: "m1", canonicalProductId: "canon-1", decidedBy: "admin" },
    ]);

    const result = await screen.findByTestId("bulk-result");
    expect(result.textContent).toMatch(/1/);
    const failures = screen.getAllByTestId("bulk-result-failure").map((el) => el.textContent);
    expect(failures).toEqual(["m2 — Sin candidatos para auto-aprobar"]);
  });
});
