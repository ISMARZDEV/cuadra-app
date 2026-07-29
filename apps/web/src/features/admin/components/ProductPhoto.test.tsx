import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductPhoto } from "./ProductPhoto";

describe("ProductPhoto", () => {
  // La razón de existir: las tiendas publican relaciones de aspecto muy distintas y recortar al
  // cuadrado se come la marca de arriba y el gramaje de abajo.
  it("contiene la foto, nunca la recorta", () => {
    render(<ProductPhoto src="https://cdn/x.jpg" alt="Arroz" emptyLabel="Sin imagen" />);

    const img = screen.getByRole("img", { name: "Arroz" });
    expect(img).toHaveClass("object-contain");
    expect(img.className).not.toMatch(/object-cover/);
  });

  it("usa la tarjeta compartida con el visor", () => {
    render(<ProductPhoto src="https://cdn/x.jpg" alt="Arroz" emptyLabel="Sin imagen" />);

    expect(screen.getByTestId("product-photo")).toHaveStyle({ backgroundColor: "#FDFFFF" });
  });

  it("el hueco se ANUNCIA, no es un div mudo", () => {
    render(<ProductPhoto src={null} alt="Arroz" emptyLabel="Sin imagen" />);

    expect(screen.getByRole("img", { name: "Sin imagen" })).toBeInTheDocument();
  });

  // Cada superficie del admin tiene su tamaño (48px en la tabla, 112px en el detalle): el tamaño
  // lo decide quien lo usa, la TARJETA la decide el componente.
  it("el tamaño lo impone quien lo llama", () => {
    render(
      <ProductPhoto src="https://cdn/x.jpg" alt="Arroz" emptyLabel="x" className="size-28 rounded-2xl" />,
    );

    const frame = screen.getByTestId("product-photo");
    expect(frame).toHaveClass("size-28");
    expect(frame).toHaveClass("rounded-2xl");
  });

  it("sin imagen también respeta el tamaño pedido", () => {
    render(<ProductPhoto src={null} alt="Arroz" emptyLabel="x" className="size-28" />);

    expect(screen.getByTestId("product-photo")).toHaveClass("size-28");
  });
});
