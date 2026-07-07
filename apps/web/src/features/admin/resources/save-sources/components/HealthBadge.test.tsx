import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HealthBadge } from "./HealthBadge";

describe("HealthBadge", () => {
  it("renders green for ok", () => {
    render(<HealthBadge health="ok" />);
    expect(screen.getByText("OK")).toHaveClass("bg-green-100");
  });

  it("renders amber for stale", () => {
    render(<HealthBadge health="stale" />);
    expect(screen.getByText("Desactualizada")).toHaveClass("bg-amber-100");
  });

  it("renders grey for paused", () => {
    render(<HealthBadge health="paused" />);
    expect(screen.getByText("Pausada")).toHaveClass("bg-gray-100");
  });
});
