import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("expo-haptics", () => ({ impactAsync: vi.fn(), ImpactFeedbackStyle: { Light: "light" } }));

import { InfoTooltip } from "./info-tooltip";

describe("InfoTooltip", () => {
  test("exposes an accessible label on the badge", () => {
    render(<InfoTooltip label="More info" message="Explains the metric." />);

    expect(screen.getByLabelText("More info")).toBeInTheDocument();
  });

  test("shows the tooltip message after tapping the badge", () => {
    render(<InfoTooltip label="More info" message="Explains the metric." />);

    expect(screen.queryByText("Explains the metric.")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByLabelText("More info")[0]);
    expect(screen.getByText("Explains the metric.")).toBeInTheDocument();
  });
});
