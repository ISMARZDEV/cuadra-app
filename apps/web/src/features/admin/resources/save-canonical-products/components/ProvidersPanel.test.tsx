import type { AdminCanonicalProviderPriceDto } from "@cuadra/api-client";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { translate } from "@/i18n/messages";

import { ProvidersPanel } from "./ProvidersPanel";

const t = (key: Parameters<typeof translate>[1]) => translate("es", key);

function p(over: Partial<AdminCanonicalProviderPriceDto>): AdminCanonicalProviderPriceDto {
  return {
    provider_id: "p",
    provider_name: "Tienda",
    store_product_id: "sp",
    price_minor: 7400,
    currency: "DOP",
    provider_logo_url: null,
    url: null,
    last_seen_at: "2026-07-25T13:55:00Z",
    is_cheapest: false,
    ...over,
  } as AdminCanonicalProviderPriceDto;
}

const ROWS = [
  p({ provider_id: "a", store_product_id: "sa", provider_name: "Sirena", price_minor: 7400,
    is_cheapest: true, previous_price_minor: 7695 }),
  p({ provider_id: "b", store_product_id: "sb", provider_name: "Bravo", price_minor: 7500 }),
  p({ provider_id: "c", store_product_id: "sc", provider_name: "Nacional", price_minor: 7695,
    previous_price_minor: 7800 }),
];

function renderPanel(rows = ROWS) {
  render(<ProvidersPanel providers={rows} locale="es" t={t as never} />);
}

describe("ProvidersPanel", () => {
  // ── Los cuatro tiles ────────────────────────────────────────────────────────

  it("los cuatro tiles salen del mismo cálculo y cierran entre sí", () => {
    // En el mockup el tile decía RD$76.00, la fila más cara RD$75.00 y la diferencia RD$1.00:
    // tres cifras que no cerraban. Acá el máximo y la diferencia tienen que ser coherentes.
    renderPanel();

    expect(screen.getByTestId("tile-lowest")).toHaveTextContent("RD$74.00");
    expect(screen.getByTestId("tile-highest")).toHaveTextContent("RD$76.95");
    expect(screen.getByTestId("tile-spread")).toHaveTextContent("RD$2.95");
    expect(screen.getByTestId("tile-stores")).toHaveTextContent("3");
  });

  it("sin tiendas no inventa estadística", () => {
    renderPanel([]);
    expect(screen.queryByTestId("tile-lowest")).not.toBeInTheDocument();
    expect(screen.getByText(/Ninguna tienda|todavía/i)).toBeInTheDocument();
  });

  // ── La tabla ────────────────────────────────────────────────────────────────

  it("la columna del precio anterior NO se llama igual que la del actual", () => {
    // El mockup tenía DOS columnas rotuladas "Precio Actual"; la segunda era la anterior.
    renderPanel();

    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toContain("Precio actual");
    expect(headers).toContain("Precio anterior");
  });

  it("marca la más barata y la más cara", () => {
    renderPanel();

    expect(within(screen.getByTestId("row-sa")).getByText("Mejor precio Save")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-sc")).getByText("Precio más alto")).toBeInTheDocument();
  });

  it("dice cuánto más cara es cada tienda que la más barata", () => {
    renderPanel();

    expect(within(screen.getByTestId("row-sb")).getByText(/RD\$1\.00/)).toBeInTheDocument();
    expect(within(screen.getByTestId("row-sa")).getByText("Mismo precio")).toBeInTheDocument();
  });

  it("una tienda sin precio anterior no muestra un tachado vacío", () => {
    renderPanel();

    const row = within(screen.getByTestId("row-sb"));
    expect(row.queryByTestId("row-previous-price")).not.toBeInTheDocument();
  });

  it("muestra el precio anterior de cada tienda cuando existe", () => {
    renderPanel();
    expect(
      within(screen.getByTestId("row-sa")).getByTestId("row-previous-price"),
    ).toHaveTextContent("RD$76.95");
  });

  // ── Búsqueda ────────────────────────────────────────────────────────────────

  it("la búsqueda filtra por nombre de tienda", async () => {
    renderPanel();

    await act(async () => {
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "brav" } });
    });

    expect(screen.getByTestId("row-sb")).toBeInTheDocument();
    expect(screen.queryByTestId("row-sa")).not.toBeInTheDocument();
  });

  it("una búsqueda sin resultados lo dice", async () => {
    renderPanel();

    await act(async () => {
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    });

    expect(screen.getByText("Ninguna tienda coincide con la búsqueda.")).toBeInTheDocument();
  });

  it("los tiles NO cambian al filtrar", async () => {
    // Los tiles resumen el abanico REAL de precios. Recalcularlos sobre lo filtrado haría que
    // "Precio más bajo" cambiara al escribir en un buscador, que no es lo que el operador pidió.
    renderPanel();

    await act(async () => {
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "brav" } });
    });

    expect(screen.getByTestId("tile-lowest")).toHaveTextContent("RD$74.00");
    expect(screen.getByTestId("tile-stores")).toHaveTextContent("3");
  });

  // ── Paginación ──────────────────────────────────────────────────────────────

  it("el pie dice cuántas tiendas se están viendo", () => {
    renderPanel();
    expect(screen.getByTestId("providers-range")).toHaveTextContent("1–3 de 3");
  });

  it("pagina cuando hay más tiendas que el tamaño de página", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      p({
        provider_id: `p${i}`,
        store_product_id: `sp${i}`,
        provider_name: `Tienda ${i}`,
        price_minor: 7400 + i * 10,
        is_cheapest: i === 0,
      }),
    );
    renderPanel(many);

    expect(screen.getByTestId("providers-range")).toHaveTextContent("1–10 de 12");
    expect(screen.getByTestId("row-sp0")).toBeInTheDocument();
    // La 11ª cae en la página 2.
    expect(screen.queryByTestId("row-sp10")).not.toBeInTheDocument();
  });

  it("la página 2 muestra el resto", async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      p({
        provider_id: `p${i}`,
        store_product_id: `sp${i}`,
        provider_name: `Tienda ${i}`,
        price_minor: 7400 + i * 10,
        is_cheapest: i === 0,
      }),
    );
    renderPanel(many);

    await act(async () => {
      screen.getByRole("button", { name: "2" }).click();
    });

    expect(screen.getByTestId("row-sp10")).toBeInTheDocument();
    expect(screen.queryByTestId("row-sp0")).not.toBeInTheDocument();
  });

  it("filtrar recalcula el rango y vuelve a la primera página", async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      p({
        provider_id: `p${i}`,
        store_product_id: `sp${i}`,
        provider_name: i === 11 ? "Bravo" : `Tienda ${i}`,
        price_minor: 7400 + i * 10,
        is_cheapest: i === 0,
      }),
    );
    renderPanel(many);

    await act(async () => {
      screen.getByRole("button", { name: "2" }).click();
    });
    await act(async () => {
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "bravo" } });
    });

    // Quedarse en la página 2 tras filtrar deja la tabla vacía con resultados que sí existen.
    expect(screen.getByTestId("providers-range")).toHaveTextContent("1–1 de 1");
    expect(screen.getByTestId("row-sp11")).toBeInTheDocument();
  });
});
