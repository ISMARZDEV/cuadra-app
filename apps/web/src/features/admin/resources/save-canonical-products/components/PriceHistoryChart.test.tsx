import type { AdminCanonicalPriceHistoryDto } from "@cuadra/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { translate } from "@/i18n/messages";

import { PriceHistoryChart } from "./PriceHistoryChart";

const t = (key: Parameters<typeof translate>[1]) => translate("es", key);

function history(
  series: AdminCanonicalPriceHistoryDto["series"],
): AdminCanonicalPriceHistoryDto {
  return {
    canonical_product_id: "cp-1",
    name: "Arroz",
    currency: "DOP",
    range: "1m",
    series,
    kpis: {},
  } as AdminCanonicalPriceHistoryDto;
}

const point = (iso: string, minor: number) => ({
  captured_at: iso,
  price_minor: minor,
  price_type: "online",
});

function renderChart(series: AdminCanonicalPriceHistoryDto["series"], visible = new Set<string>()) {
  return render(
    <PriceHistoryChart
      history={history(series)}
      visible={visible}
      onToggle={vi.fn()}
      t={t as never}
      locale="es"
    />,
  );
}

describe("PriceHistoryChart", () => {
  it("sin puntos muestra el estado vacío en vez de un SVG en blanco", () => {
    renderChart([{ provider_id: "p1", provider_name: "Sirena", points: [] }]);

    expect(screen.getByText(/no hay histórico/i)).toBeInTheDocument();
    expect(document.querySelector("svg")).toBeNull();
  });

  it("dibuja una línea por tienda visible", () => {
    renderChart([
      {
        provider_id: "p1",
        provider_name: "Sirena",
        points: [point("2026-07-01T00:00:00Z", 10000), point("2026-07-10T00:00:00Z", 12000)],
      },
      {
        provider_id: "p2",
        provider_name: "Nacional",
        points: [point("2026-07-05T00:00:00Z", 11000)],
      },
    ]);

    expect(document.querySelectorAll("path[stroke-width='2']")).toHaveLength(2);
  });

  it("una serie apagada no se dibuja pero sigue en la leyenda para poder reactivarla", () => {
    renderChart(
      [
        { provider_id: "p1", provider_name: "Sirena", points: [point("2026-07-01T00:00:00Z", 10000)] },
        { provider_id: "p2", provider_name: "Nacional", points: [point("2026-07-01T00:00:00Z", 11000)] },
      ],
      new Set(["p1"]),
    );

    expect(document.querySelectorAll("path[stroke-width='2']")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Nacional/ })).toBeInTheDocument();
  });

  it("una serie PLANA se centra en vez de quedar pegada al borde inferior", () => {
    // Es el caso más común del catálogo: una tienda que no cambió de precio. Sin centrarla, la
    // línea queda abajo con todo el alto vacío arriba y se lee como un gráfico roto.
    renderChart([
      {
        provider_id: "p1",
        provider_name: "Sirena",
        points: [point("2026-07-01T00:00:00Z", 10000), point("2026-07-10T00:00:00Z", 10000)],
      },
    ]);

    const svg = document.querySelector("svg")!;
    const [, , , height] = svg.getAttribute("viewBox")!.split(" ").map(Number);
    const circle = svg.querySelector("circle")!;
    const cy = Number(circle.getAttribute("cy"));

    expect(cy).toBeGreaterThan(height * 0.3);
    expect(cy).toBeLessThan(height * 0.7);
  });

  it("una serie plana no repite la misma etiqueta de precio en 5 líneas de grilla", () => {
    renderChart([
      {
        provider_id: "p1",
        provider_name: "Sirena",
        points: [point("2026-07-01T00:00:00Z", 10000)],
      },
    ]);

    expect(document.querySelectorAll("svg line")).toHaveLength(1);
  });

  it("cada punto lleva su tooltip con tienda, precio y fecha", () => {
    renderChart([
      {
        provider_id: "p1",
        provider_name: "Sirena",
        points: [point("2026-07-01T00:00:00Z", 10000)],
      },
    ]);

    const title = document.querySelector("svg circle title")!;
    expect(title.textContent).toContain("Sirena");
    expect(title.textContent).toContain("100.00");
  });

  it("explica el baseline carry-in bajo el gráfico", () => {
    renderChart([
      { provider_id: "p1", provider_name: "Sirena", points: [point("2026-07-01T00:00:00Z", 10000)] },
    ]);

    expect(screen.getByText(/precio que ya venía vigente/i)).toBeInTheDocument();
  });
});
