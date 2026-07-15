import type { AdminReviewQueueRowDto } from "@cuadra/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
vi.mock("vike/client/router", () => ({ navigate: (...args: unknown[]) => navigateMock(...args) }));

const toastMock = vi.fn();
vi.mock("sonner", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

import { ReviewRow } from "./ReviewRow";

function row(overrides: Partial<AdminReviewQueueRowDto> = {}): AdminReviewQueueRowDto {
  return {
    match_id: "m1",
    store_product_id: "sp1",
    confidence: 0.6,
    method: "vector",
    provider_id: "p1",
    provider_name: "Merca",
    provider_logo_url: null,
    store_product_name: "Arroz La Garza",
    store_product_brand: "La Garza",
    store_product_size_text: "24 Oz",
    store_product_image_url: null,
    category: null,
    candidate_count: 3,
    created_at: "2026-03-02T12:00:00Z",
    ...overrides,
  };
}

function renderRow(overrides: Partial<AdminReviewQueueRowDto> = {}, extra: { onDelete?: (id: string) => void } = {}) {
  const onDelete = extra.onDelete ?? vi.fn();
  const onToggleSelect = vi.fn();
  render(
    <table>
      <tbody>
        <ReviewRow
          row={row(overrides)}
          href={`/admin/review-queue/${overrides.match_id ?? "m1"}`}
          locale="es"
          selected={false}
          onToggleSelect={onToggleSelect}
          onDelete={onDelete}
        />
      </tbody>
    </table>,
  );
  return { onDelete, onToggleSelect };
}

describe("ReviewRow (Batch 6 restyle)", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    toastMock.mockClear();
  });

  it("splits size_text into a Tamaño pill (amount) and a Tipo Peso pill (unit)", () => {
    renderRow({ store_product_size_text: "24 Oz" });
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getByText("Oz")).toBeInTheDocument();
  });

  it("renders the candidate_count as a numeric badge (Inf. Producto)", () => {
    renderRow({ candidate_count: 7 });
    expect(screen.getByTestId("candidate-count-badge")).toHaveTextContent("7");
  });

  it("renders the CategoryBadge with the row's category", () => {
    renderRow({ category: { slug: "frutas-verduras", name: "Frutas & Verduras" } });
    const badge = screen.getByText("Frutas & Verduras");
    expect(badge).toHaveStyle({ backgroundColor: "#dfffc8" });
  });

  it("category null -> CategoryBadge falls back to 'Sin categoría'", () => {
    renderRow({ category: null });
    expect(screen.getByText("Sin categoría")).toBeInTheDocument();
  });

  it("renders the ProviderLogo — bundled chain logo by name when there's no logo url (Jumbo → jumbo.png)", () => {
    renderRow({ provider_name: "Jumbo", provider_logo_url: null });
    expect(screen.getByRole("img", { name: "Jumbo" })).toBeInTheDocument();
  });

  it("renders the MethodBadge with the short technical label (LLM, not localized)", () => {
    renderRow({ method: "llm" });
    expect(screen.getByText("LLM")).toBeInTheDocument();
  });

  it("renders a graceful 'no image' tile when store_product_image_url is null", () => {
    renderRow({ store_product_image_url: null });
    expect(screen.getByLabelText("Sin imagen")).toBeInTheDocument();
  });

  it("renders the product thumbnail image when store_product_image_url is present", () => {
    renderRow({ store_product_image_url: "https://example.com/p.png" });
    expect(screen.getByRole("img", { name: "Arroz La Garza" })).toHaveAttribute(
      "src",
      "https://example.com/p.png",
    );
  });

  it("Descripción column renders a graceful placeholder (no field in the DTO yet)", () => {
    renderRow();
    expect(screen.getByText("—", { selector: "span" })).toBeInTheDocument();
  });

  it("Acciones menu: 'Ver' navigates to the row's detail href", () => {
    renderRow({ match_id: "m-abc" });
    fireEvent.click(screen.getByLabelText("Más acciones"));
    fireEvent.click(screen.getByText("Ver"));
    expect(navigateMock).toHaveBeenCalledWith("/admin/review-queue/m-abc");
  });

  it("Acciones menu: 'Eliminar' calls onDelete with the match id", () => {
    const { onDelete } = renderRow({ match_id: "m-xyz" });
    fireEvent.click(screen.getByLabelText("Más acciones"));
    fireEvent.click(screen.getByText("Eliminar"));
    expect(onDelete).toHaveBeenCalledWith("m-xyz");
  });

  it("Acciones menu: 'Editar' is a stub that toasts 'coming soon'", () => {
    renderRow();
    fireEvent.click(screen.getByLabelText("Más acciones"));
    fireEvent.click(screen.getByText("Editar"));
    expect(toastMock).toHaveBeenCalledWith("Próximamente");
  });

  it("Acciones menu: 'Ver en la tienda' opens the store product url in a new tab", () => {
    // F0 (link a la tienda): reemplaza el 'Compartir' stub — redirige a la página del producto
    // en la tienda origen (nueva pestaña, noopener). No hay opción 'Compartir'.
    const openMock = vi.fn();
    vi.stubGlobal("open", openMock);
    renderRow({ store_product_url: "https://sirena.do/arroz-la-garza/p" });

    fireEvent.click(screen.getByLabelText("Más acciones"));
    expect(screen.queryByText("Compartir")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Ver en la tienda"));

    expect(openMock).toHaveBeenCalledWith(
      "https://sirena.do/arroz-la-garza/p",
      "_blank",
      "noopener,noreferrer",
    );
    vi.unstubAllGlobals();
  });

  it("Acciones menu: 'Ver en la tienda' is disabled when there is no store url", () => {
    const openMock = vi.fn();
    vi.stubGlobal("open", openMock);
    renderRow({ store_product_url: null });

    fireEvent.click(screen.getByLabelText("Más acciones"));
    fireEvent.click(screen.getByText("Ver en la tienda"));

    expect(openMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
