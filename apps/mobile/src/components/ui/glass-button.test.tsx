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
});
