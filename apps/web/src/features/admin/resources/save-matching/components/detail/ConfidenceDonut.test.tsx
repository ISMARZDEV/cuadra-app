import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConfidenceDonut } from "./ConfidenceDonut";

describe("ConfidenceDonut", () => {
  it("muestra el porcentaje redondeado y expone un aria-label accesible", () => {
    render(<ConfidenceDonut confidence={0.85} />);
    expect(screen.getByText("85%")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /confianza del match 85%/i }),
    ).toBeInTheDocument();
  });

  it("el arco de valor usa strokeDasharray = pct/100 y el stroke de la banda HIGH", () => {
    const { container } = render(<ConfidenceDonut confidence={0.85} />);
    const arc = container.querySelector("circle[stroke-dasharray]");
    expect(arc).toHaveAttribute("stroke-dasharray", "85 100");
    expect(arc?.getAttribute("class")).toContain("stroke-emerald-500");
  });

  it("banda baja (< 0.55) → arco rosa (necesita ojo)", () => {
    const { container } = render(<ConfidenceDonut confidence={0.26} />);
    const arc = container.querySelector("circle[stroke-dasharray]");
    expect(arc).toHaveAttribute("stroke-dasharray", "26 100");
    expect(arc?.getAttribute("class")).toContain("stroke-rose-400");
  });
});
