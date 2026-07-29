import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThumbnailWithCount } from "./ThumbnailWithCount";

describe("ThumbnailWithCount", () => {
  it("pinta la imagen cuando hay url", () => {
    render(<ThumbnailWithCount src="https://cdn/x.jpg" alt="Arroz" count={3} emptyLabel="Sin imagen" />);

    expect(screen.getByRole("img", { name: "Arroz" })).toHaveAttribute("src", "https://cdn/x.jpg");
  });

  // Las tiendas publican relaciones de aspecto muy distintas (Bravo manda lienzos grandes con el
  // producto chico adentro). Con `object-cover` el cuadrado le comía la marca de arriba y el
  // gramaje de abajo — justo lo que se mira para decidir si dos productos son el mismo.
  it("la foto se CONTIENE en el cuadrado, nunca se recorta", () => {
    render(<ThumbnailWithCount src="https://cdn/x.jpg" alt="Arroz" count={3} emptyLabel="Sin imagen" />);

    const img = screen.getByRole("img", { name: "Arroz" });
    expect(img).toHaveClass("object-contain");
    expect(img.className).not.toMatch(/object-cover/);
  });

  it("la foto va sobre la MISMA tarjeta que usa el visor", () => {
    render(<ThumbnailWithCount src="https://cdn/x.jpg" alt="Arroz" count={3} emptyLabel="Sin imagen" />);

    // Si el thumbnail y el visor no compartieran fondo, abrir el modal cambiaría el color detrás
    // de la foto y parecería otra imagen. La tarjeta la aporta `ProductPhoto`, el primitivo que
    // comparten las cinco superficies del OFV.
    expect(screen.getByTestId("product-photo")).toHaveStyle({ backgroundColor: "#FDFFFF" });
  });

  // El hueco NO puede ser un div mudo: un operador con lector de pantalla tiene que enterarse de
  // que al producto le falta la foto, que es justo el trabajo pendiente que la lista señala.
  it("sin imagen deja un placeholder ANUNCIADO, no un div vacío", () => {
    render(<ThumbnailWithCount src={null} alt="Arroz" count={3} emptyLabel="Sin imagen" />);

    expect(screen.getByRole("img", { name: "Sin imagen" })).toBeInTheDocument();
  });

  it("el contador va sobre la esquina inferior derecha, en verde bosque sobre lima", () => {
    render(<ThumbnailWithCount src={null} alt="" count={7} emptyLabel="Sin imagen" />);

    const badge = screen.getByText("7");
    expect(badge).toHaveClass("bg-brand-forest");
    expect(badge).toHaveClass("text-brand-lime");
    expect(badge).toHaveClass("-bottom-1");
  });

  // `null` y `0` son cosas distintas: el catálogo no quiere badge cuando no hay tiendas, pero la
  // cola de revisión SÍ quiere mostrar "0 candidatos" — es la señal de que no hay a qué enlazar.
  it("un contador en cero se muestra; uno nulo no", () => {
    const { rerender } = render(<ThumbnailWithCount src={null} alt="" count={0} emptyLabel="x" />);
    expect(screen.getByText("0")).toBeInTheDocument();

    rerender(<ThumbnailWithCount src={null} alt="" count={null} emptyLabel="x" />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
