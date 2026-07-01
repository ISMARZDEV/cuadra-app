import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage } from "@/i18n";

let mockAccounts: unknown[] = [];

vi.mock("../api", () => ({
  useCurrencyPrimary: () => "DOP",
  useAccounts: () => ({ data: mockAccounts }),
  useDailyTarget: () => ({
    data: {
      by_currency: [
        {
          currency: "DOP",
          monthly_limit_minor: 500000,
          spent_month_minor: 200000,
          remaining_minor: 300000,
          days_remaining: 15,
          daily_target_minor: 135000,
          spent_today_minor: 35000,
        },
      ],
    },
  }),
  pickByCurrency: (items: { currency: string }[] | undefined, currency: string | undefined) =>
    items?.find((i) => i.currency === currency),
}));

import { DailyDiaryCard } from "./daily-diary-card";

describe("DailyDiaryCard", () => {
  beforeEach(() => {
    setLanguage("es");
    mockAccounts = [];
  });

  test("empty state (no wallets) shows the Add Your Wallets CTA", () => {
    render(<DailyDiaryCard />);

    expect(screen.getByText("Agregar tus billeteras")).toBeInTheDocument();
    expect(screen.queryByText("Balance total")).not.toBeInTheDocument();
  });

  test("populated state shows DOP and USD balances on separate lines, never summed", () => {
    mockAccounts = [
      { id: "a1", type: "debit", currency: "DOP", name: "Wallet DOP", balance_minor: 5000000 },
      { id: "a2", type: "credit", currency: "USD", name: "Wallet USD", balance_minor: 50000 },
    ];
    render(<DailyDiaryCard />);

    expect(screen.getByText("Balance total")).toBeInTheDocument();
    expect(screen.getByText("DOP $50,000.00")).toBeInTheDocument();
    expect(screen.getByText("USD $500.00")).toBeInTheDocument();
    expect(screen.queryByText("Agregar tus billeteras")).not.toBeInTheDocument();
  });

  test("populated state shows the daily target and spent-today figures", () => {
    mockAccounts = [{ id: "a1", type: "debit", currency: "DOP", name: "Wallet DOP", balance_minor: 5000000 }];
    render(<DailyDiaryCard />);

    expect(screen.getByText("Meta diaria de gasto")).toBeInTheDocument();
    expect(screen.getByText("$1,350.00")).toBeInTheDocument();
    expect(screen.getByText("Gastaste hoy")).toBeInTheDocument();
    expect(screen.getByText("-$350.00")).toBeInTheDocument();
  });
});
