// Exact Figma money-role color pair (income/expense/savings/balance), theme-inverted — dark bg +
// light accent text in one theme, swapped in the other. Shared by the chat's empty-state widgets
// AND Insights' Accounts card metric tiles, so the two features stay visually identical instead
// of duplicating hex literals. Deliberately separate from `theme/index.ts`'s `palette.income/
// expense/savings/balance`, which is a flat, non-inverted set feeding tailwind.config.js.
export type MoneyRole = "income" | "expense" | "savings" | "balance";

export const MONEY_ROLE_COLORS: Record<MoneyRole, { dark: string; light: string }> = {
  income: { dark: "#033648", light: "#89E1FF" },
  expense: { dark: "#8D3306", light: "#FFD4AB" },
  savings: { dark: "#60004B", light: "#FA96EA" },
  balance: { dark: "#014E3A", light: "#9EF7C8" },
};
