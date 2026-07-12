import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CreateCanonicalPanel } from "./CreateCanonicalPanel";

const base = {
  defaultName: "Arroz La Garza Premium 20 Lbs",
  defaultBrand: "LA GARZA",
  defaultSizeText: "20 Lbs",
  suggestedCategoryId: "leaf-arroz",
  suggestedCategoryName: "Arroz, Granos & Legumbres",
};

describe("CreateCanonicalPanel", () => {
  it("prefilla nombre/marca/tamaño del store y adivina la medida (Lbs → masa)", () => {
    render(<CreateCanonicalPanel {...base} onCreate={vi.fn()} />);
    expect(screen.getByTestId("cc-name")).toHaveValue("Arroz La Garza Premium 20 Lbs");
    expect(screen.getByTestId("cc-brand")).toHaveValue("LA GARZA");
    expect(screen.getByTestId("cc-amount")).toHaveValue("20");
    expect(screen.getByTestId("cc-measure")).toHaveValue("mass");
    expect(screen.getByTestId("cc-category")).toHaveTextContent("Arroz, Granos & Legumbres");
  });

  it("crea → propaga el payload con la hoja sugerida y la cantidad numérica", () => {
    const onCreate = vi.fn();
    render(<CreateCanonicalPanel {...base} onCreate={onCreate} />);

    fireEvent.click(screen.getByTestId("cc-submit"));

    expect(onCreate).toHaveBeenCalledWith({
      name: "Arroz La Garza Premium 20 Lbs",
      brand: "LA GARZA",
      quantityAmount: 20,
      quantityMeasure: "mass",
      taxonomyNodeId: "leaf-arroz",
    });
  });

  it("bloquea la creación si el nombre queda vacío, y muestra el error", () => {
    const onCreate = vi.fn();
    render(<CreateCanonicalPanel {...base} onCreate={onCreate} />);

    fireEvent.change(screen.getByTestId("cc-name"), { target: { value: "  " } });
    fireEvent.click(screen.getByTestId("cc-submit"));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByTestId("cc-error")).toBeInTheDocument();
  });

  it("sin categoría sugerida → botón deshabilitado y aviso (nunca canónico sin categoría)", () => {
    const onCreate = vi.fn();
    render(
      <CreateCanonicalPanel
        {...base}
        suggestedCategoryId={null}
        suggestedCategoryName={null}
        onCreate={onCreate}
      />,
    );

    expect(screen.getByTestId("cc-submit")).toBeDisabled();
    expect(screen.getByTestId("cc-category-missing")).toBeInTheDocument();
  });
});
