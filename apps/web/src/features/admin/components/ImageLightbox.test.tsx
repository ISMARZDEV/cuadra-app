import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ImageLightbox } from "./ImageLightbox";

const THREE = ["https://cdn/a.jpg", "https://cdn/b.jpg", "https://cdn/c.jpg"];

function open(props: Partial<React.ComponentProps<typeof ImageLightbox>> = {}) {
  return render(
    <ImageLightbox open images={THREE} title="Arroz Goya" onClose={vi.fn()} {...props} />,
  );
}

describe("ImageLightbox", () => {
  it("muestra la imagen seleccionada en grande", () => {
    open();

    expect(screen.getByTestId("lightbox-main")).toHaveAttribute("src", THREE[0]);
  });

  it("las flechas cambian la imagen grande", () => {
    open();

    fireEvent.click(screen.getByTestId("lightbox-next"));
    expect(screen.getByTestId("lightbox-main")).toHaveAttribute("src", THREE[1]);

    fireEvent.click(screen.getByTestId("lightbox-prev"));
    expect(screen.getByTestId("lightbox-main")).toHaveAttribute("src", THREE[0]);
  });

  // Circular a propósito: en una galería de 3 fotos, toparse con una flecha muerta obliga a
  // razonar dónde se está en vez de seguir mirando.
  it("la navegación es circular en los dos sentidos", () => {
    open();

    fireEvent.click(screen.getByTestId("lightbox-prev"));
    expect(screen.getByTestId("lightbox-main")).toHaveAttribute("src", THREE[2]);

    fireEvent.click(screen.getByTestId("lightbox-next"));
    expect(screen.getByTestId("lightbox-main")).toHaveAttribute("src", THREE[0]);
  });

  it("se navega con el teclado", () => {
    open();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("lightbox-main")).toHaveAttribute("src", THREE[1]);
  });

  it("clickear una miniatura salta a esa imagen", () => {
    open();

    fireEvent.click(screen.getByTestId("lightbox-thumb-2"));
    expect(screen.getByTestId("lightbox-main")).toHaveAttribute("src", THREE[2]);
  });

  // BORDE y no `ring`: el ring se dibuja fuera de la caja y el `overflow-x-auto` de la tira lo
  // recortaba en las esquinas. Los 2px están SIEMPRE para que cambiar de selección no mueva la tira.
  it("la miniatura activa se marca en lima, con borde y no con ring", () => {
    open();

    const first = screen.getByTestId("lightbox-thumb-0");
    expect(first).toHaveClass("border-brand-lime");
    expect(first).toHaveClass("border-2");
    expect(screen.getByTestId("lightbox-thumb-1")).toHaveClass("border-2");
    expect(first.className).not.toMatch(/\bring-/);
  });

  // Con una sola foto no hay a dónde ir: la tira y las flechas serían controles muertos.
  it("con UNA sola imagen no pinta miniaturas ni flechas", () => {
    open({ images: ["https://cdn/solo.jpg"] });

    expect(screen.getByTestId("lightbox-main")).toHaveAttribute("src", "https://cdn/solo.jpg");
    expect(screen.queryByTestId("lightbox-next")).not.toBeInTheDocument();
    expect(screen.queryByTestId("lightbox-thumb-0")).not.toBeInTheDocument();
  });

  it("sin imágenes no se abre nada", () => {
    open({ images: [] });

    expect(screen.queryByTestId("lightbox-main")).not.toBeInTheDocument();
  });

  // El par de superficies ES el diseño: lienzo gris + tarjetas casi blancas. Con las dos en blanco
  // los cuadrados de las fotos (que ya vienen sobre blanco) pierden todo contorno.
  it("el lienzo es gris y las tarjetas casi blancas", () => {
    open();

    expect(screen.getByTestId("lightbox-popup")).toHaveStyle({ backgroundColor: "#F4F6F7" });
    expect(screen.getByTestId("lightbox-frame")).toHaveStyle({ backgroundColor: "#FDFFFF" });
  });

  // Las fotos de producto YA vienen con fondo blanco: sin borde propio la tarjeta se funde con el
  // modal y la galería se ve como una mancha sin contorno.
  it("la imagen vive en una tarjeta con borde, radio y aire", () => {
    open();

    const frame = screen.getByTestId("lightbox-frame");
    expect(frame).toHaveClass("border");
    expect(frame).toHaveClass("rounded-3xl");
    expect(frame).toHaveClass("p-6");
    expect(frame).toHaveClass("aspect-square");
  });

  it("el índice se reinicia cuando cambia la galería", () => {
    const { rerender } = open();
    fireEvent.click(screen.getByTestId("lightbox-next"));
    expect(screen.getByTestId("lightbox-main")).toHaveAttribute("src", THREE[1]);

    rerender(
      <ImageLightbox open images={["https://cdn/otro.jpg"]} title="Otro" onClose={vi.fn()} />,
    );

    expect(screen.getByTestId("lightbox-main")).toHaveAttribute("src", "https://cdn/otro.jpg");
  });

  it("anuncia en qué posición de la galería está", async () => {
    open();

    await waitFor(() => expect(screen.getByText("1 / 3")).toBeInTheDocument());
  });
});
