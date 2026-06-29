import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage } from "@/i18n";

// Mock the boundaries (cuadra-mobile-testing §3): the api hooks and the router. The screen owns
// composition; the Query hooks (over the SDK) and navigation are stubbed.
const mockMutate = vi.fn();
const mockBack = vi.fn();
let currentPersonality = "coach";

vi.mock("./api", () => ({
  usePersonality: () => ({ data: currentPersonality, isLoading: false }),
  useSetPersonality: () => ({ mutate: mockMutate, isPending: false }),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack }) }));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: unknown }) => children,
}));

import { PersonalityScreen } from "./personality-screen";

describe("PersonalityScreen", () => {
  beforeEach(() => {
    mockMutate.mockClear();
    mockBack.mockClear();
    currentPersonality = "coach";
    setLanguage("es"); // deterministic labels regardless of the jsdom device locale
  });

  test("renders the three personality options", () => {
    render(<PersonalityScreen />);
    expect(screen.getByLabelText("Neutro")).toBeTruthy();
    expect(screen.getByLabelText("Coach")).toBeTruthy();
    expect(screen.getByLabelText("Roast")).toBeTruthy();
  });

  test("marks the current personality as selected", () => {
    render(<PersonalityScreen />);
    expect(screen.getByLabelText("Coach").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByLabelText("Roast").getAttribute("aria-checked")).toBe("false");
  });

  test("tapping an option saves it via the mutation", () => {
    render(<PersonalityScreen />);
    fireEvent.click(screen.getByLabelText("Roast"));
    expect(mockMutate).toHaveBeenCalledWith("roast");
  });

  test("the back control navigates back", () => {
    render(<PersonalityScreen />);
    fireEvent.click(screen.getByLabelText("Volver"));
    expect(mockBack).toHaveBeenCalled();
  });
});
