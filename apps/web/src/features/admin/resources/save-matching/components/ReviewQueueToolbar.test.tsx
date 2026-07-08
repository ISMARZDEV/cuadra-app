import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ReviewQueueParams } from "../types";
import { ReviewQueueToolbar } from "./ReviewQueueToolbar";

const baseParams: ReviewQueueParams = {
  market: "DO",
  order_by: "uncertainty",
  limit: 50,
  offset: 0,
};

function renderToolbar(overrides: Partial<Parameters<typeof ReviewQueueToolbar>[0]> = {}) {
  const props = {
    params: baseParams,
    onParamsChange: vi.fn(),
    search: "",
    onSearchChange: vi.fn(),
    view: "list" as const,
    onViewChange: vi.fn(),
    selectedCount: 0,
    onBulkApprove: vi.fn(),
    onBulkReject: vi.fn(),
    locale: "es" as const,
    ...overrides,
  };
  render(<ReviewQueueToolbar {...props} />);
  return props;
}

describe("ReviewQueueToolbar", () => {
  it("el input de búsqueda dispara onSearchChange con el valor tipeado", () => {
    const props = renderToolbar();
    fireEvent.change(screen.getByPlaceholderText("Buscar..."), { target: { value: "coca" } });
    expect(props.onSearchChange).toHaveBeenCalledWith("coca");
  });

  it("muestra el hint de teclado ⌘F junto al buscador", () => {
    renderToolbar();
    expect(screen.getByText("⌘F")).toBeInTheDocument();
  });

  it("el toggle de vista dispara onViewChange al elegir 'list'", () => {
    const props = renderToolbar({ view: "grid" as never });
    fireEvent.click(screen.getByRole("radio", { name: "Vista de lista" }));
    expect(props.onViewChange).toHaveBeenCalledWith("list");
  });

  it("la opción grid del toggle está deshabilitada (stub)", () => {
    renderToolbar();
    expect(screen.getByRole("radio", { name: "Vista de cuadrícula (próximamente)" })).toBeDisabled();
  });

  it("el dropdown Acciones está deshabilitado cuando no hay selección", () => {
    renderToolbar({ selectedCount: 0 });
    expect(screen.getByRole("button", { name: "Acciones" })).toBeDisabled();
  });

  it("el dropdown Acciones muestra aprobar/rechazar y disparan sus callbacks", () => {
    const props = renderToolbar({ selectedCount: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Acciones" }));

    fireEvent.click(screen.getByText("Aprobar seleccionados"));
    expect(props.onBulkApprove).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Acciones" }));
    fireEvent.click(screen.getByText("Rechazar seleccionados"));
    expect(props.onBulkReject).toHaveBeenCalledTimes(1);
  });

  it("el botón de filtros abre el panel y cambiar el proveedor dispara onParamsChange", () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));

    const providerInput = screen.getByLabelText("Proveedor (id)");
    fireEvent.change(providerInput, { target: { value: "prov-1" } });
    fireEvent.blur(providerInput);

    expect(props.onParamsChange).toHaveBeenCalledWith({ provider_id: "prov-1" });
  });

  it("el botón de exportar existe pero está deshabilitado (stub)", () => {
    renderToolbar();
    expect(screen.getByRole("button", { name: "Exportar (próximamente)" })).toBeDisabled();
  });

  it("el dropdown 'Mostrar todos' renderiza sus opciones (stub)", () => {
    renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar todos" }));
    expect(screen.getAllByText("Mostrar todos").length).toBeGreaterThan(0);
  });
});
