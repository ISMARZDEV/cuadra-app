import type { TaxonomyLeafDto } from "@cuadra/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CategoryCell } from "./CategoryCell";

const LEAVES: TaxonomyLeafDto[] = [
  { id: "leaf-arroz", name: "Arroz", top_name: "Despensa", top_slug: "despensa" },
  { id: "leaf-cerveza", name: "Cerveza", top_name: "Alcohol", top_slug: "alcohol" },
];

function cell(props: Partial<React.ComponentProps<typeof CategoryCell>> = {}) {
  return render(
    <CategoryCell
      storeProductId="sp-1"
      category={null}
      leaves={LEAVES}
      onSet={vi.fn().mockResolvedValue(true)}
      locale="es"
      {...props}
    />,
  );
}

describe("CategoryCell", () => {
  it("muestra el hueco como algo EDITABLE, no como un dato que falta", () => {
    // Toda la premisa del diseño: si "Sin categoría" no se ve accionable, el operador no descubre
    // que puede arreglarlo ahí mismo y termina buscando un formulario en otro lado.
    cell();

    const trigger = screen.getByRole("button");
    expect(trigger.getAttribute("aria-haspopup")).toBeTruthy();
  });

  it("ofrece las hojas con su TOPE, porque el nombre solo es ambiguo", () => {
    cell();
    fireEvent.click(screen.getByRole("button"));

    // "Arroz" a secas no dice bajo qué categoría cae; "Despensa › Arroz" sí.
    expect(screen.getByText(/Despensa/)).toBeTruthy();
    expect(screen.getByText(/Arroz/)).toBeTruthy();
  });

  it("filtra al escribir", () => {
    cell();
    fireEvent.click(screen.getByRole("button"));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "cerv" } });

    expect(screen.getByText(/Cerveza/)).toBeTruthy();
    expect(screen.queryByText(/Arroz/)).toBeNull();
  });

  it("pinta el valor nuevo AL INSTANTE, sin esperar al servidor", async () => {
    // La celda es la interacción más repetida del flujo (diez correcciones seguidas). Esperar el
    // round-trip en cada una la volvería lenta justo donde tiene que ser barata.
    const onSet = vi.fn().mockResolvedValue(true);
    cell({ onSet });

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText(/Cerveza/));

    await waitFor(() => expect(screen.getByRole("button").textContent).toContain("Alcohol"));
    expect(onSet).toHaveBeenCalledWith("sp-1", "leaf-cerveza");
  });

  it("REVIERTE si el servidor lo rechaza", async () => {
    // Un optimismo que no se deshace es una mentira: la celda diría "Alcohol" y la DB otra cosa.
    const onSet = vi.fn().mockResolvedValue(false);
    cell({ onSet, category: { slug: "despensa", name: "Despensa" } });

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText(/Cerveza/));

    await waitFor(() => expect(screen.getByRole("button").textContent).toContain("Despensa"));
  });

  it("no ofrece edición cuando no hay taxonomía cargada", () => {
    // Sin hojas el selector estaría vacío: un menú que no puede hacer nada es un control decorativo.
    cell({ leaves: [] });

    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
  });
});
