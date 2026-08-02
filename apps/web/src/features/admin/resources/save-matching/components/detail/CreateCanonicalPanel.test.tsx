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

describe("CreateCanonicalPanel — productos sin tamaño", () => {
  // No todo producto declara tamaño: un plato del mostrador, un pan por pieza o una fruta a granel
  // se venden por unidad. Exigirlo obligaba al operador a inventar un número para poder guardar.
  it("permite crear sin tamaño y NO manda un tamaño inventado", () => {
    const onCreate = vi.fn();
    // Sin `defaultSizeText`: es el caso real de un producto que no declara tamaño.
    render(<CreateCanonicalPanel {...base} defaultSizeText="" onCreate={onCreate} />);

    fireEvent.change(screen.getByTestId("cc-name"), { target: { value: "Plato Para Perro" } });
    fireEvent.click(screen.getByTestId("cc-submit"));

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ sizeText: "" }));
  });

  it("el tamaño y la unidad ya no se marcan como obligatorios", () => {
    render(<CreateCanonicalPanel {...base} onCreate={vi.fn()} />);
    expect(screen.getByText(/^Tamaño$/)).toBeInTheDocument();
    expect(screen.getByText(/^Unidad de medida$/)).toBeInTheDocument();
  });
});
