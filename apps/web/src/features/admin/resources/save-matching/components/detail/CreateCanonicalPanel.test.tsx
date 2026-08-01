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
  it("prefilla nombre/marca/tamaño del store y canoniza la ortografía de la unidad (Lbs → Lb)", () => {
    render(<CreateCanonicalPanel {...base} onCreate={vi.fn()} />);
    expect(screen.getByTestId("cc-name")).toHaveValue("Arroz La Garza Premium 20 Lbs");
    expect(screen.getByTestId("cc-brand")).toHaveValue("LA GARZA");
    expect(screen.getByTestId("cc-amount")).toHaveValue("20");
    expect(screen.getByTestId("cc-measure")).toHaveValue("Lb");
    expect(screen.getByTestId("cc-category")).toHaveTextContent("Arroz, Granos & Legumbres");
  });

  it("distingue Ml de Lt — la ambigüedad de 'Volumen' era el bug", () => {
    render(
      <CreateCanonicalPanel {...base} defaultSizeText="355 Ml" onCreate={vi.fn()} />,
    );
    expect(screen.getByTestId("cc-amount")).toHaveValue("355");
    expect(screen.getByTestId("cc-measure")).toHaveValue("Ml");
  });

  it("crea → propaga el TEXTO del tamaño (la conversión a unidad base es del servidor)", () => {
    const onCreate = vi.fn();
    render(<CreateCanonicalPanel {...base} onCreate={onCreate} />);

    fireEvent.click(screen.getByTestId("cc-submit"));

    expect(onCreate).toHaveBeenCalledWith({
      name: "Arroz La Garza Premium 20 Lbs",
      brand: "LA GARZA",
      sizeText: "20 Lb",
      taxonomyNodeId: "leaf-arroz",
    });
  });

  it("unidad que el dominio no sabe convertir → select vacío y creación bloqueada", () => {
    const onCreate = vi.fn();
    render(
      <CreateCanonicalPanel {...base} defaultSizeText="355 Cc" onCreate={onCreate} />,
    );

    // adivinar una medida en silencio es cómo un producto termina con la unidad equivocada
    expect(screen.getByTestId("cc-measure")).toHaveValue("");
    fireEvent.click(screen.getByTestId("cc-submit"));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByTestId("cc-error")).toBeInTheDocument();
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

  it("anuncia que el canónico heredará las fotos del proveedor (el efecto no es invisible)", () => {
    render(<CreateCanonicalPanel {...base} onCreate={vi.fn()} />);

    expect(screen.getByTestId("cc-inherits-images")).toHaveTextContent(/hasta 10/i);
  });
});
