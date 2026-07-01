import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage } from "@/i18n";

import { InsightsWheel } from "./insights-wheel";

describe("InsightsWheel", () => {
  beforeEach(() => setLanguage("es"));

  test("empty variant shows the empty copy and an Add button, no money figures", () => {
    render(<InsightsWheel variant="empty" totalExpenseMinor={0} budgetMinor={0} currency="USD" />);

    expect(screen.getByText("Tu actividad financiera aparecerá aquí 😉!")).toBeInTheDocument();
    expect(screen.getByLabelText("Agregar")).toBeInTheDocument();
    expect(screen.queryByText("Gasto total")).not.toBeInTheDocument();
  });

  test("populated variant shows formatted Total Expense and Budget", () => {
    render(
      <InsightsWheel variant="populated" totalExpenseMinor={135000} budgetMinor={1900000} currency="USD" />,
    );

    expect(screen.getByText("Gasto total")).toBeInTheDocument();
    expect(screen.getByText("-$1,350.00")).toBeInTheDocument();
    expect(screen.getByText("Presupuesto")).toBeInTheDocument();
    expect(screen.getByText("$19,000.00")).toBeInTheDocument();
  });

  test("shows the trend pill only when trendPercent is provided", () => {
    render(
      <InsightsWheel
        variant="populated"
        totalExpenseMinor={135000}
        budgetMinor={1900000}
        currency="USD"
        trendPercent={75}
      />,
    );

    expect(screen.getByText("+75%")).toBeInTheDocument();
  });

  test("renders one marker dot per entry in markers[]", () => {
    render(
      <InsightsWheel
        variant="populated"
        totalExpenseMinor={135000}
        budgetMinor={1900000}
        currency="USD"
        markers={[
          { id: "music", emoji: "🎶", angleDeg: 200, ringColor: "#fea34d" },
          { id: "gas", emoji: "⛽️", angleDeg: 280, ringColor: "#ff6568" },
        ]}
      />,
    );

    expect(screen.getByText("🎶")).toBeInTheDocument();
    expect(screen.getByText("⛽️")).toBeInTheDocument();
  });

  test("calls onAddPress when the empty-state Add button is tapped", () => {
    const onAddPress = vi.fn();
    render(
      <InsightsWheel
        variant="empty"
        totalExpenseMinor={0}
        budgetMinor={0}
        currency="USD"
        onAddPress={onAddPress}
      />,
    );

    screen.getByLabelText("Agregar").click();

    expect(onAddPress).toHaveBeenCalledOnce();
  });

  test("always renders all 7 surrounding buttons, both variants", () => {
    render(<InsightsWheel variant="empty" totalExpenseMinor={0} budgetMinor={0} currency="USD" />);

    expect(screen.getByLabelText("Nueva categoría")).toBeInTheDocument();
    expect(screen.getByLabelText("Movimientos")).toBeInTheDocument();
    expect(screen.getByLabelText("Reportes")).toBeInTheDocument();
    expect(screen.getByLabelText("Inicio")).toBeInTheDocument();
    expect(screen.getByLabelText("Presupuestos")).toBeInTheDocument();
    expect(screen.getByLabelText("Alertas")).toBeInTheDocument();
    expect(screen.getByLabelText("Metas")).toBeInTheDocument();
  });
});
