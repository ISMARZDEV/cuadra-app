import type { AdminReviewDetailDto } from "@cuadra/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// La pantalla lee vía `useData` y resuelve vía `../api` — se aíslan ambos + la navegación (nunca red
// ni router real). Mismo patrón que `SourcesScreen.test`.
let mockDetail: AdminReviewDetailDto;
let mockNextMatchId: string | null;
let mockPrevMatchId: string | null;
vi.mock("vike-react/useData", () => ({
  useData: () => ({
    detail: mockDetail,
    nextMatchId: mockNextMatchId,
    prevMatchId: mockPrevMatchId,
    queuePosition: 1,
    queueTotal: 117,
  }),
}));

const resolveReviewMatch = vi.fn();
vi.mock("../api", () => ({
  resolveReviewMatch: (...args: unknown[]) => resolveReviewMatch(...args),
}));

const navigate = vi.fn();
vi.mock("vike/client/router", () => ({ navigate: (...args: unknown[]) => navigate(...args) }));

import { ReviewDetailScreen } from "./ReviewDetailScreen";

function detail(overrides: Partial<AdminReviewDetailDto> = {}): AdminReviewDetailDto {
  return {
    match_id: "m1",
    store_product_id: "sp1",
    confidence: 0.85,
    method: "llm",
    store_product_name: "Arroz Goya Canilla Extra Largo 10 Lb",
    store_product_brand: "GOYA",
    store_product_size_text: "10 Lb",
    store_product_image_url: null,
    store_product_sku: "sku-1",
    store_product_ean: "7460100000123",
    provider_name: "Sirena",
    candidates: [
      { canonical_product_id: "c1", name: "Arroz Extra Largo Campos", brand: "Campos", score: 0.76, image_url: null, size_text: null },
      { canonical_product_id: "c2", name: "Arroz Doña Ana", brand: "Doña Ana", score: 0.73, image_url: null, size_text: null },
    ],
    ...overrides,
  };
}

describe("ReviewDetailScreen (composición)", () => {
  beforeEach(() => {
    resolveReviewMatch.mockReset();
    navigate.mockReset();
    resolveReviewMatch.mockResolvedValue({});
    mockDetail = detail();
    mockNextMatchId = null;
    mockPrevMatchId = null;
  });

  it("compone header, panel de tienda, candidatos y zona de rechazo", () => {
    render(<ReviewDetailScreen />);
    expect(screen.getByRole("heading", { name: "Revisar match" })).toBeInTheDocument();
    expect(screen.getByText("Producto de la tienda")).toBeInTheDocument();
    expect(screen.getByText("Arroz Extra Largo Campos")).toBeInTheDocument();
    expect(screen.getByText("¿Ningún candidato es correcto?")).toBeInTheDocument();
  });

  it("aprobar un candidato → resolve con su canonical_product_id y PASA AL SIGUIENTE (no a la lista)", async () => {
    mockNextMatchId = "m2";
    render(<ReviewDetailScreen />);
    fireEvent.click(screen.getAllByRole("button", { name: /aprobar candidato/i })[0]!);

    await waitFor(() =>
      expect(resolveReviewMatch).toHaveBeenCalledWith(
        expect.objectContaining({ matchId: "m1", canonicalProductId: "c1" }),
      ),
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/admin/review-queue/m2"));
  });

  it("aprobar el ÚLTIMO de la cola (sin siguiente) → cae a la lista", async () => {
    mockNextMatchId = null;
    render(<ReviewDetailScreen />);
    fireEvent.click(screen.getAllByRole("button", { name: /aprobar candidato/i })[0]!);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/admin/review-queue"));
  });

  it("rechazar con motivo → resolve sin canónico, con el reason_code, y pasa al siguiente", async () => {
    mockNextMatchId = "m2";
    render(<ReviewDetailScreen />);
    fireEvent.change(screen.getByTestId("reason-code-select"), {
      target: { value: "different_brand" },
    });
    fireEvent.click(screen.getByTestId("reject-submit"));

    await waitFor(() =>
      expect(resolveReviewMatch).toHaveBeenCalledWith(
        expect.objectContaining({
          matchId: "m1",
          canonicalProductId: null,
          reasonCode: "different_brand",
        }),
      ),
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/admin/review-queue/m2"));
  });

  it("atajo Option+A → aprueba el candidato top (plain 'a' NO)", async () => {
    render(<ReviewDetailScreen />);

    fireEvent.keyDown(document, { key: "a", code: "KeyA" });
    expect(resolveReviewMatch).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "å", code: "KeyA", altKey: true });
    await waitFor(() =>
      expect(resolveReviewMatch).toHaveBeenCalledWith(
        expect.objectContaining({ canonicalProductId: "c1" }),
      ),
    );
  });

  it("atajo 'n' → navega al SIGUIENTE match pendiente (no a la lista)", () => {
    mockNextMatchId = "m9";
    render(<ReviewDetailScreen />);
    fireEvent.keyDown(document, { key: "n" });
    expect(navigate).toHaveBeenCalledWith("/admin/review-queue/m9");
  });

  it("atajo 'n' sin siguiente → cae a la lista", () => {
    mockNextMatchId = null;
    render(<ReviewDetailScreen />);
    fireEvent.keyDown(document, { key: "n" });
    expect(navigate).toHaveBeenCalledWith("/admin/review-queue");
  });

  it("atajo 'p' → navega al match ANTERIOR", () => {
    mockPrevMatchId = "m7";
    render(<ReviewDetailScreen />);
    fireEvent.keyDown(document, { key: "p" });
    expect(navigate).toHaveBeenCalledWith("/admin/review-queue/m7");
  });

  it("atajo 'p' sin anterior → no hace nada", () => {
    mockPrevMatchId = null;
    render(<ReviewDetailScreen />);
    fireEvent.keyDown(document, { key: "p" });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("los atajos también son botones clickeables (banner)", () => {
    mockNextMatchId = "m9";
    render(<ReviewDetailScreen />);
    // El banner y el pager comparten la acción "siguiente"; apuntamos al del banner por su nombre
    // completo (incluye la tecla "N").
    fireEvent.click(screen.getByRole("button", { name: "N Siguiente match" }));
    expect(navigate).toHaveBeenCalledWith("/admin/review-queue/m9");
  });
});
