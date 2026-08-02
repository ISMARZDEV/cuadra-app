import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RematchResultModal, type RematchResultRow } from "./RematchResultModal";

const LINKED: RematchResultRow = {
  match_id: "m-1",
  status: "auto_linked",
  method: "ean",
  confidence: 1,
  store_product_name: "BRAVO ARROZ PREMIUM 10 LB",
  canonical_product_id: "canon-1",
  canonical_name: "Arroz Premium 10 Lb",
};

const PENDING: RematchResultRow = {
  match_id: "m-2",
  status: "pending_review",
  method: "trgm",
  confidence: 0.62,
  store_product_name: "FRESCAN POLLO Y ARROZ 1 LB",
  canonical_product_id: null,
  canonical_name: null,
};

function linked(n: number): RematchResultRow[] {
  return Array.from({ length: n }, (_, i) => ({
    ...LINKED,
    match_id: `m-${i}`,
    store_product_name: `PRODUCTO DE COLA ${i}`,
    canonical_product_id: `canon-${i}`,
    canonical_name: `Canonico ${i}`,
  }));
}

function setup(rows: RematchResultRow[], failed = 0) {
  const onClose = vi.fn();
  render(
    <RematchResultModal rows={rows} failedCount={failed} onClose={onClose} locale="es" />,
  );
  return { onClose };
}

describe("RematchResultModal", () => {
  it("muestra el par producto de la cola → canónico al que se enlazó", () => {
    // Es el punto entero del modal: un id contra otro id no se puede auditar.
    setup([LINKED]);
    expect(screen.getByText("BRAVO ARROZ PREMIUM 10 LB")).toBeInTheDocument();
    expect(screen.getByText("Arroz Premium 10 Lb")).toBeInTheDocument();
  });

  it("lista SOLO las enlazadas, no las que siguieron en la cola", () => {
    // El modal responde "¿qué se enlazó?". Mezclar las que no se enlazaron obligaría al operador a
    // filtrar a ojo justo lo que vino a revisar.
    setup([LINKED, PENDING]);
    expect(screen.getByText("BRAVO ARROZ PREMIUM 10 LB")).toBeInTheDocument();
    expect(screen.queryByText("FRESCAN POLLO Y ARROZ 1 LB")).not.toBeInTheDocument();
  });

  it("muestra el método y la confianza de cada enlace", () => {
    // Sin el método no se distingue un enlace por EAN (determinista, confianza 1.0) de uno por
    // nombre — y son revisiones de riesgo muy distinto.
    setup([LINKED]);
    expect(screen.getByText(/EAN/i)).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("dice cuántas quedaron en la cola y cuántas fallaron, sin esconderlo", () => {
    setup([LINKED, PENDING], 2);
    expect(screen.getByTestId("rematch-result-summary")).toHaveTextContent("1");
    expect(screen.getByTestId("rematch-result-summary")).toHaveTextContent("2");
  });

  it("cada enlace abre el detalle del canónico en una pestaña nueva", () => {
    // El modal es para AUDITAR: si algo se ve raro, el operador tiene que poder abrir la ficha del
    // canónico sin perder el resultado del lote — de ahí `target="_blank"` y no navegar en sitio.
    setup([LINKED]);
    const link = screen.getByRole("link", { name: /Arroz Premium 10 Lb|detalle/i });
    expect(link).toHaveAttribute("href", "/admin/canonical-products/canon-1");
    expect(link).toHaveAttribute("target", "_blank");
    // Sin `noopener` la pestaña nueva puede tocar `window.opener` de la consola de admin.
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("cuando NADA se enlazó lo dice explícitamente en vez de mostrar una tabla vacía", () => {
    // Una tabla vacía se lee como "se rompió". El vacío tiene que explicar que la corrida SÍ pasó.
    setup([PENDING]);
    expect(screen.getByTestId("rematch-result-empty")).toBeInTheDocument();
  });

  it("se muestra como TABLA con encabezados, no como lista suelta", () => {
    // Con lotes de decenas de filas una lista plana no se escanea: la tabla da columnas fijas y
    // alineación, que es lo que permite comparar de un vistazo.
    setup([LINKED]);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").length).toBeGreaterThanOrEqual(4);
  });

  it("pagina: con 12 enlazadas muestra 10 y el resto en la página 2", () => {
    setup(linked(12));

    expect(screen.getByText("PRODUCTO DE COLA 0")).toBeInTheDocument();
    expect(screen.queryByText("PRODUCTO DE COLA 10")).not.toBeInTheDocument();

    // `PaginationLink` del design system renderiza un <button>, no un <a>.
    fireEvent.click(screen.getByRole("button", { name: "2" }));

    expect(screen.getByText("PRODUCTO DE COLA 10")).toBeInTheDocument();
    expect(screen.queryByText("PRODUCTO DE COLA 0")).not.toBeInTheDocument();
  });

  it("dice el rango visible sobre el total", () => {
    setup(linked(12));
    expect(screen.getByTestId("rematch-result-range")).toHaveTextContent("1–10");
    expect(screen.getByTestId("rematch-result-range")).toHaveTextContent("12");
  });

  it("no pagina cuando todo entra en una página", () => {
    setup(linked(3));
    expect(screen.queryByRole("button", { name: "2" })).not.toBeInTheDocument();
  });
});

describe("RematchResultModal — cierre", () => {
  // El modal es el ÚNICO lugar donde vive el resultado del lote: no se vuelve a pedir al servidor.
  // Un clic fuera por accidente lo perdía y obligaba a re-ejecutar la corrida entera.
  it("NO se cierra al hacer clic fuera del panel", () => {
    const { onClose } = setup([LINKED]);

    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("se cierra con la X y con el botón del pie", () => {
    // Las dos comparten etiqueta a propósito: hacen lo mismo, y nombrarlas distinto haría dudar.
    const { onClose } = setup([LINKED]);
    const cierres = screen.getAllByRole("button", { name: /cerrar|close|fechar/i });
    expect(cierres).toHaveLength(2);

    fireEvent.click(cierres[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
