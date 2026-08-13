import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { AndroidHoldPopover } from "./android-hold-popover";

const ANCHOR = { x: 100, y: 200, width: 80, height: 44 };

describe("AndroidHoldPopover", () => {
  test("shows nothing while not visible", () => {
    render(<AndroidHoldPopover visible={false} anchor={ANCHOR} label="¿Cuánto gasté este mes 📅?" />);

    expect(screen.queryByText("¿Cuánto gasté este mes 📅?")).toBeNull();
  });

  test("shows the full label once visible", () => {
    render(<AndroidHoldPopover visible anchor={ANCHOR} label="¿Cuánto gasté este mes 📅?" />);

    expect(screen.getByText("¿Cuánto gasté este mes 📅?")).toBeInTheDocument();
  });
});
