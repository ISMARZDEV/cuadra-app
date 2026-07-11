import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReviewQueueKpis } from "./ReviewQueueKpis";

// Smoke + contenido de la fila de KPI cards (Figma 549:10191). Ejerce la matemática SVG de los 4
// charts (barras/gauge/línea/mix) — si alguna produce un path con NaN o revienta, este test cae.
describe("ReviewQueueKpis", () => {
  it("renderiza los 4 títulos, valores y badges de los KPI cards (es)", () => {
    render(<ReviewQueueKpis />);

    // Títulos
    expect(screen.getByText("Cola Pendiente")).toBeInTheDocument();
    expect(screen.getByText("Auto-link Rate")).toBeInTheDocument();
    expect(screen.getByText("Métodos de Match")).toBeInTheDocument();
    expect(screen.getByText("Tiempo en Cola")).toBeInTheDocument();

    // Valores destacados
    expect(screen.getByText("221")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("1.2d")).toBeInTheDocument();
    // "72%" aparece en el valor Y en la leyenda del gauge → al menos uno
    expect(screen.getAllByText("72%").length).toBeGreaterThanOrEqual(1);

    // Badges/pills
    expect(screen.getByText("+12 productos")).toBeInTheDocument();
    expect(screen.getByText("+5pp")).toBeInTheDocument();
    expect(screen.getByText("Canales activos")).toBeInTheDocument();
    expect(screen.getByText("-0.3 días")).toBeInTheDocument();
  });

  it("marca los 4 cards como datos demo (honestidad de señal)", () => {
    render(<ReviewQueueKpis />);
    expect(screen.getAllByText("demo")).toHaveLength(4);
  });

  it("el chart de métodos usa los códigos cortos del Figma (Hybrid/Human/Vector, no localizados)", () => {
    render(<ReviewQueueKpis />);
    expect(screen.getByText("Hybrid")).toBeInTheDocument();
    expect(screen.getByText("Human")).toBeInTheDocument();
    expect(screen.getByText("Vector")).toBeInTheDocument();
  });

  it("renderiza en inglés cuando se pasa locale=en", () => {
    render(<ReviewQueueKpis locale="en" />);
    expect(screen.getByText("Pending Queue")).toBeInTheDocument();
    expect(screen.getByText("Match Methods")).toBeInTheDocument();
    expect(screen.getByText("Active channels")).toBeInTheDocument();
  });
});
