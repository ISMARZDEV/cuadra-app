import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TruncatedText } from "./TruncatedText";

/** jsdom no hace layout: `scrollHeight`/`clientHeight` son siempre 0. Se fuerzan en el prototipo
 * para poder simular "el texto NO entra" vs "entra". */
function mockLayout(scrollHeight: number, clientHeight: number) {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => clientHeight,
  });
}

afterEach(() => {
  // Se restauran o el mock se filtra al resto de la suite.
  Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
  Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
});

describe("TruncatedText", () => {
  it("shows the text plainly when it FITS — no tooltip trigger", () => {
    // Un tooltip que repite un texto ya visible es ruido: obliga a un gesto para no revelar nada.
    mockLayout(20, 20);

    render(<TruncatedText text="corto" />);

    expect(screen.getByText("corto")).toBeInTheDocument();
    expect(screen.getByTestId("truncated-text")).toHaveAttribute("data-truncated", "false");
  });

  it("becomes hoverable only when the text does NOT fit", () => {
    mockLayout(80, 32); // dos líneas visibles, el contenido pide más

    render(<TruncatedText text="una descripción muy larga que no entra" />);

    expect(screen.getByTestId("truncated-text")).toHaveAttribute("data-truncated", "true");
  });

  it("forces wrapping — the base TableCell inherits `whitespace-nowrap`", () => {
    // Sin esto el texto no envuelve, `line-clamp` no recorta (no hay `…`) y el tooltip nunca
    // dispara porque `scrollHeight === clientHeight`. UN estilo heredado rompía las tres cosas.
    // Es un assert de clase a propósito: acá la clase ES el contrato contra un estilo heredado, y
    // jsdom no hace layout, así que no hay forma de comprobar el efecto real.
    mockLayout(20, 20);

    render(<TruncatedText text="algo" />);

    expect(screen.getByText("algo")).toHaveClass("whitespace-normal");
  });

  it("keeps the measured node MOUNTED across the truncated flip", () => {
    // Antes el <span> medido se re-parentaba al activarse el tooltip: React montaba uno nuevo, el
    // efecto no volvía a correr y el ResizeObserver quedaba sobre el nodo viejo, ya desprendido.
    // El árbol ahora no cambia de forma — solo el CONTENIDO del tooltip es condicional.
    mockLayout(80, 32);

    const { rerender } = render(<TruncatedText text="larga" />);
    const first = screen.getByTestId("truncated-text");

    rerender(<TruncatedText text="larga" />);

    expect(screen.getByTestId("truncated-text")).toBe(first);
  });

  it("renders nothing at all when there is no text", () => {
    // `—` lo decide la celda, no este componente: acá una cadena vacía no debe dejar un hueco.
    mockLayout(0, 0);

    const { container } = render(<TruncatedText text={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
