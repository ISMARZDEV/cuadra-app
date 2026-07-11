import type { AdminReviewQueueRowDto } from "@cuadra/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ReviewQueueData } from "../types";

// La pantalla lee vía `useData`/`usePageContext` (patrón vike-react — igual a ProductScreen/
// CategoryListing) y navega vía `vike/client/router` — se mockean los tres, mismo patrón de
// `vi.mock` ya usado en `login-screen.test.tsx` de este repo (no un mecanismo nuevo).
let mockData: ReviewQueueData;
vi.mock("vike-react/useData", () => ({ useData: () => mockData }));
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: "/admin/review-queue" }),
}));
vi.mock("vike/client/router", () => ({ navigate: vi.fn() }));

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

describe("ReviewQueueListScreen", () => {
  it("renders rows in the exact order the data prop gives them (uncertainty-order is a backend concern)", () => {
    mockData = {
      rows: [
        row({ match_id: "m-high", store_product_name: "Producto Alto", confidence: 0.9 }),
        row({ match_id: "m-mid", store_product_name: "Producto Medio", confidence: 0.6 }),
        row({ match_id: "m-low", store_product_name: "Producto Bajo", confidence: 0.2 }),
      ],
      total: 3,
      params: {
        market: "DO",
        order_by: "uncertainty",
        limit: 50,
        offset: 0,
      },
    };

    render(<ReviewQueueListScreen />);

    const names = screen.getAllByTestId("review-row-name").map((el) => el.textContent);
    expect(names).toEqual(["Producto Alto", "Producto Medio", "Producto Bajo"]);
  });

  it("color-codes each row by its confidence band (never a bare number)", () => {
    mockData = {
      rows: [
        row({ match_id: "m-high", confidence: 0.9 }),
        row({ match_id: "m-mid", confidence: 0.6 }),
        row({ match_id: "m-low", confidence: 0.2 }),
      ],
      total: 3,
      params: { market: "DO", order_by: "uncertainty", limit: 50, offset: 0 },
    };

    render(<ReviewQueueListScreen />);

    // Pill de la columna "Confianza" (Figma 483:12422): bg por banda con los hex EXACTOS del Figma
    // (verde #b4ff8f / ámbar #f8f48f / rojo #ffc4c4) + el % explícito.
    const badges = screen.getAllByTestId("confidence-badge");
    expect(badges[0].className).toContain("bg-[#b4ff8f]");
    expect(badges[0]).toHaveTextContent("90%");
    expect(badges[1].className).toContain("bg-[#f8f48f]");
    expect(badges[1]).toHaveTextContent("60%");
    expect(badges[2].className).toContain("bg-[#ffc4c4]");
    expect(badges[2]).toHaveTextContent("20%");
  });

  it("links each row to its detail page", () => {
    mockData = {
      rows: [row({ match_id: "m-abc" })],
      total: 1,
      params: { market: "DO", order_by: "uncertainty", limit: 50, offset: 0 },
    };

    render(<ReviewQueueListScreen />);

    const link = screen.getByRole("link", { name: /Arroz La Garza/ });
    expect(link).toHaveAttribute("href", "/admin/review-queue/m-abc");
  });
});
