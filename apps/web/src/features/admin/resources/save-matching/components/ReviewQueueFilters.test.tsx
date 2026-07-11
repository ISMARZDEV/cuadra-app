import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ReviewQueueParams } from "../types";
import { ReviewQueueFilters } from "./ReviewQueueFilters";

const baseParams: ReviewQueueParams = {
  market: "DO",
  order_by: "uncertainty",
  limit: 50,
  offset: 0,
};

const providers = [
  { value: "1001", label: "Abarrotes La Central (ID: 1001)" },
  { value: "1002", label: "Distribuidora del Caribe (ID: 1002)" },
];

function renderFilters(overrides: Partial<Parameters<typeof ReviewQueueFilters>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    params: baseParams,
    onApply: vi.fn(),
    providers,
    locale: "es" as const,
    ...overrides,
  };
  render(<ReviewQueueFilters {...props} />);
  return props;
}

describe("ReviewQueueFilters", () => {
  it("con rango de confianza completo, aplica sin límites (undefined) y cierra", () => {
    const props = renderFilters();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    expect(props.onApply).toHaveBeenCalledWith({
      provider_id: undefined,
      method: undefined,
      order_by: "uncertainty",
      confidence_min: undefined,
      confidence_max: undefined,
    });
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("seleccionar un proveedor del combobox lo propaga al aplicar", () => {
    const props = renderFilters();
    // Abrir el combobox y elegir un proveedor.
    fireEvent.focus(screen.getByRole("combobox", { name: "Proveedor" }));
    fireEvent.click(screen.getByText("Abarrotes La Central (ID: 1001)"));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    expect(props.onApply).toHaveBeenCalledWith(
      expect.objectContaining({ provider_id: "1001" }),
    );
  });

  it("'Limpiar filtros' resetea el proveedor elegido antes de aplicar", () => {
    const props = renderFilters({
      params: { ...baseParams, provider_id: "1002" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    expect(props.onApply).toHaveBeenCalledWith(
      expect.objectContaining({ provider_id: undefined }),
    );
  });
});
