import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage } from "@/i18n";

// Mock the boundaries (cuadra-mobile-testing §3): the api hooks and the router.
const mockMutate = vi.fn();
const mockBack = vi.fn();
let currentPrefs: { primary: string; extra: string[]; all: string[] } = {
  primary: "DOP",
  extra: ["USD"],
  all: ["DOP", "USD"],
};

vi.mock("@/lib/hooks/use-currency-preferences", () => ({
  useCurrencyPreferences: () => ({ data: currentPrefs, isLoading: false }),
  useSetExtraCurrencies: () => ({ mutate: mockMutate, isPending: false }),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack }) }));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: unknown }) => children,
}));

import { CurrenciesScreen } from "./currencies-screen";

describe("CurrenciesScreen", () => {
  beforeEach(() => {
    mockMutate.mockClear();
    mockBack.mockClear();
    currentPrefs = { primary: "DOP", extra: ["USD"], all: ["DOP", "USD"] };
    setLanguage("es"); // deterministic labels regardless of the jsdom device locale
  });

  test("renders the primary currency as a fixed, non-toggleable badge", () => {
    render(<CurrenciesScreen />);
    const primaryRow = screen.getByLabelText("Peso dominicano");
    expect(primaryRow).toBeTruthy();
    expect(primaryRow.getAttribute("aria-disabled")).toBe("true");
  });

  test("marks currently-selected extra currencies as checked", () => {
    render(<CurrenciesScreen />);
    expect(screen.getByLabelText("Dólar estadounidense").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByLabelText("Euro").getAttribute("aria-checked")).toBe("false");
  });

  test("tapping an unselected currency adds it to extra", () => {
    render(<CurrenciesScreen />);
    fireEvent.click(screen.getByLabelText("Euro"));
    expect(mockMutate).toHaveBeenCalledWith(["USD", "EUR"]);
  });

  test("tapping a selected currency removes it from extra", () => {
    render(<CurrenciesScreen />);
    fireEvent.click(screen.getByLabelText("Dólar estadounidense"));
    expect(mockMutate).toHaveBeenCalledWith([]);
  });

  test("disables unselected rows once 3 extra currencies are chosen", () => {
    currentPrefs = { primary: "DOP", extra: ["USD", "COP", "BRL"], all: ["DOP", "USD", "COP", "BRL"] };
    render(<CurrenciesScreen />);
    const euro = screen.getByLabelText("Euro");
    expect(euro.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(euro);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  test("the back control navigates back", () => {
    render(<CurrenciesScreen />);
    fireEvent.click(screen.getByLabelText("Volver"));
    expect(mockBack).toHaveBeenCalled();
  });
});
