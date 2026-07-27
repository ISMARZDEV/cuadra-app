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

  // ── Escala honesta ─────────────────────────────────────────────────────────
  // El caso real que lo destapó: Bravo 474.00 · Nacional 474.95 · Sirena 475.00. Un peso de
  // diferencia sobre RD$474 (0.2%) se dibujaba ocupando TODO el alto del gráfico, como un
  // desplome — mientras el KPI de al lado decía "Variación del rango RD$0.00".

  it("una diferencia ínfima NO se dibuja como un desplome", () => {
    renderChart([
      { provider_id: "p1", provider_name: "Bravo", points: [point("2026-07-21T00:00:00Z", 47400)] },
      { provider_id: "p2", provider_name: "Sirena", points: [point("2026-07-21T00:00:00Z", 47500)] },
    ]);

    const svg = document.querySelector("svg")!;
    const [, , , height] = svg.getAttribute("viewBox")!.split(" ").map(Number);
    const ys = [...svg.querySelectorAll("circle")].map((c) => Number(c.getAttribute("cy")));
    const separacion = Math.max(...ys) - Math.min(...ys);

    // RD$1 sobre RD$474 no puede ocupar más de una fracción del alto del gráfico.
    expect(separacion).toBeLessThan(height * 0.25);
  });

  it("una diferencia REAL sí usa el alto del gráfico", () => {
    // La otra cara: si el piso de escala se pasa de generoso, aplana diferencias que importan.
    renderChart([
      { provider_id: "p1", provider_name: "Bravo", points: [point("2026-07-21T00:00:00Z", 10000)] },
      { provider_id: "p2", provider_name: "Sirena", points: [point("2026-07-21T00:00:00Z", 20000)] },
    ]);

    const svg = document.querySelector("svg")!;
    const [, , , height] = svg.getAttribute("viewBox")!.split(" ").map(Number);
    const ys = [...svg.querySelectorAll("circle")].map((c) => Number(c.getAttribute("cy")));

    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(height * 0.4);
  });

  it("con todas las capturas del mismo día el eje X no repite la fecha dos veces", () => {
    // Horas elegidas para caer el MISMO día local: `captured_at` viaja en UTC y se formatea en
    // hora local, así que un 00:00Z se muestra como el día anterior en RD (UTC−4).
    renderChart([
      { provider_id: "p1", provider_name: "Bravo", points: [point("2026-07-21T12:00:00Z", 47400)] },
      { provider_id: "p2", provider_name: "Sirena", points: [point("2026-07-21T15:00:00Z", 47500)] },
    ]);

    const etiquetas = [...document.querySelectorAll("svg text")]
      .map((n) => n.textContent ?? "")
      .filter((s) => /jul/i.test(s));

    expect(etiquetas).toHaveLength(1);
  });

  it("explica el baseline carry-in bajo el gráfico", () => {
    renderChart([
      { provider_id: "p1", provider_name: "Sirena", points: [point("2026-07-01T00:00:00Z", 10000)] },
    ]);

    expect(screen.getByText(/precio que ya venía vigente/i)).toBeInTheDocument();
  });
});
