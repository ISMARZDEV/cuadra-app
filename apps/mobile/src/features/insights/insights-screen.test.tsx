import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage } from "@/i18n";

// InfoTooltip (Accounts card header "i" badge) pulls in expo-haptics transitively.
vi.mock("expo-haptics", () => ({ impactAsync: vi.fn(), ImpactFeedbackStyle: { Light: "light" } }));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: unknown }) => children,
}));

vi.mock("./api", () => ({
  useCurrencyPrimary: () => "USD",
  useMetrics: () => ({ data: { by_currency: [] } }),
  useDailyTarget: () => ({ data: { by_currency: [] } }),
  useAccounts: () => ({ data: [] }),
  useTransactions: () => ({ data: [] }),
  useSpaces: () => ({ data: [] }),
  pickByCurrency: () => undefined,
}));

import { InsightsScreen } from "./insights-screen";

describe("InsightsScreen", () => {
  beforeEach(() => setLanguage("es"));

  test("renders the wheel, nav row, and all 3 carousel cards", () => {
    render(<InsightsScreen />);

    // Wheel — empty state (no data mocked above).
    expect(screen.getByText("Tu actividad financiera aparecerá aquí 😉!")).toBeInTheDocument();
    // Nav row — the one functional button.
    expect(screen.getByLabelText("Inicio")).toBeInTheDocument();
    // The 3 cards.
    expect(screen.getByText("Cuentas")).toBeInTheDocument();
    expect(screen.getByText("Agregar espacio")).toBeInTheDocument();
    expect(screen.getByText("Diario")).toBeInTheDocument();
  });
});
