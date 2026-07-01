import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ScallopFab } from "./scallop-fab";

describe("ScallopFab", () => {
  test("exposes its accessible label", () => {
    render(<ScallopFab label="Add" />);

    expect(screen.getByLabelText("Add")).toBeInTheDocument();
  });

  test("fires onPress when tapped", () => {
    const onPress = vi.fn();
    render(<ScallopFab label="Add" onPress={onPress} />);

    fireEvent.click(screen.getByLabelText("Add"));

    expect(onPress).toHaveBeenCalledOnce();
  });
});
