import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage } from "@/i18n";

// InfoTooltip (header "i" badge) pulls in expo-haptics transitively.
vi.mock("expo-haptics", () => ({ impactAsync: vi.fn(), ImpactFeedbackStyle: { Light: "light" } }));

vi.mock("../api", () => ({
  useCurrencyPrimary: () => "USD",
  useMetrics: () => ({
    data: {
      by_currency: [
        {
          currency: "USD",
          total_income_minor: 2035000,
          total_expenses_minor: 135000,
          balance_minor: 1900000,
          total_balance_minor: 1900000,
          net_worth_minor: 1900000,
          savings_minor: 0,
        },
      ],
    },
  }),
  useTransactions: () => ({ data: mockTransactions }),
  useAccounts: () => ({ data: [] }),
  pickByCurrency: (items: { currency: string }[] | undefined, currency: string | undefined) =>
    items?.find((i) => i.currency === currency),
}));

let mockTransactions: unknown[] = [];

import { AccountsCard } from "./accounts-card";

describe("AccountsCard", () => {
  beforeEach(() => {
    setLanguage("es");
    mockTransactions = [];
  });

  test("always shows the 4 metric tiles, formatted", () => {
    render(<AccountsCard />);

    expect(screen.getByText("Ingresos totales")).toBeInTheDocument();
    expect(screen.getByText("+ $20,350.00")).toBeInTheDocument();
    expect(screen.getByText("Gastos totales")).toBeInTheDocument();
    expect(screen.getByText("-$1,350.00")).toBeInTheDocument();
    expect(screen.getByText("Balance")).toBeInTheDocument();
    expect(screen.getByText("+ $19,000.00")).toBeInTheDocument();
  });

  test("empty state shows the Add New Transaction CTA and no tx rows", () => {
    mockTransactions = [];
    render(<AccountsCard />);

    expect(screen.getByText("Agregar transacción")).toBeInTheDocument();
    expect(screen.queryByText("Ver todo")).not.toBeInTheDocument();
  });

  test("populated state shows tx rows and the See All pill instead of the CTA", () => {
    mockTransactions = [
      {
        id: "tx1",
        type: "expense",
        amount_minor: 35000,
        currency: "USD",
        account_id: "a1",
        counter_account_id: "a2",
        occurred_at: "2026-06-30T12:05:00Z",
        source: "manual",
        merchant: { name: "Spotify" },
      },
    ];
    render(<AccountsCard />);

    expect(screen.getByLabelText("Ver todo")).toBeInTheDocument();
    expect(screen.getByText("Spotify")).toBeInTheDocument();
    expect(screen.queryByText("Agregar transacción")).not.toBeInTheDocument();
  });
});
