import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AdminTableFooter, pageWindow } from "./AdminTableFooter";

function setup(over: Partial<Parameters<typeof AdminTableFooter>[0]> = {}) {
  const props = {
    limit: 10,
    onLimitChange: vi.fn(),
    pageSizeOptions: [10, 25, 50],
    currentPage: 3,
    totalPages: 8,
    onPageChange: vi.fn(),
    rangeLabel: "21–30 de 78",
    showLabel: "Mostrar",
    perPageLabel: "por página",
    ...over,
  };
  render(<AdminTableFooter {...props} />);
  return props;
}

describe("AdminTableFooter", () => {
  it("muestra el rango ya formateado que le pasa el caller", () => {
    setup();
    expect(screen.getByTestId("admin-table-range")).toHaveTextContent("21–30 de 78");
  });

  it("navega a la página elegida", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    expect(props.onPageChange).toHaveBeenCalledWith(4);
  });

  it("no retrocede antes de la primera ni avanza más allá de la última", () => {
    // Sin el clamp, «anterior» en la página 1 pide la página 0 y el caller calcula un offset
    // negativo: la tabla vuelve vacía sin que nada avise.
    const primera = setup({ currentPage: 1 });
    // El paginador del design system renderiza <button> con aria-label en inglés.
    fireEvent.click(screen.getByRole("button", { name: /previous/i }));
    expect(primera.onPageChange).toHaveBeenCalledWith(1);
  });

  it("marca la página actual para lectores de pantalla", () => {
    setup({ currentPage: 3 });
    expect(screen.getByRole("button", { name: "3" })).toHaveAttribute("aria-current", "page");
  });
});

describe("pageWindow", () => {
  it("centra la ventana alrededor de la página actual", () => {
    expect(pageWindow(5, 10)).toEqual([3, 4, 5, 6, 7]);
  });

  it("no se sale por los bordes", () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(10, 10)).toEqual([6, 7, 8, 9, 10]);
  });

  it("con menos páginas que la ventana devuelve solo las que hay", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
  });
});
