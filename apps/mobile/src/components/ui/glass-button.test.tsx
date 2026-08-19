import { fireEvent, render, screen } from "@testing-library/react";
import { Plus } from "lucide-react-native";
import { describe, expect, test, vi } from "vitest";

import { GlassButton } from "./glass-button";

describe("GlassButton", () => {
  test("exposes its accessible label", () => {
    render(<GlassButton icon={Plus} label="Attach" />);

    expect(screen.getByLabelText("Attach")).toBeInTheDocument();
  });

  test("fires onPress when tapped", () => {
    const onPress = vi.fn();
    render(<GlassButton icon={Plus} label="Attach" onPress={onPress} />);

    fireEvent.click(screen.getByLabelText("Attach"));

    expect(onPress).toHaveBeenCalledOnce();
  });

  // El punto es OPT-IN: un botón de herramienta no lleva nada encima salvo que se lo pidan.
  test("no draws a badge by default", () => {
    render(<GlassButton icon={Plus} label="Attach" />);

    expect(screen.queryByTestId("glass-button-badge")).toBeNull();
  });

  test("draws a badge when asked", () => {
    render(<GlassButton icon={Plus} label="Attach" badge />);

    expect(screen.getByTestId("glass-button-badge")).toBeInTheDocument();
  });
});
