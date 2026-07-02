import {
  type CurrencyMetrics,
  type DailyTargetByCurrency,
  getDailyTarget,
  getMetrics,
  listAccounts,
  listSpaces,
  listTransactions,
} from "@cuadra/api-client";
import { useQuery } from "@tanstack/react-query";

import { useCurrencyPreferences } from "@/lib/hooks/use-currency-preferences";

import { currentMonthRange } from "./date-range";

// Query hooks over the generated SDK (cuadra-mobile §3), mirroring features/settings/api.ts's
// pattern. Field-mapping note (docs/sdd/insights-home-mvp.md): the wheel and Daily Diary's
// target/spent-today figures read ONLY from `useDailyTarget()` — it's always calendar-month-
// scoped server-side by construction, so Budget/Total Expense can never silently disagree from
// two independently-computed date windows. `useMetrics()` is reserved for the Accounts card's 4
// tiles (income/expenses/savings/balance), a genuinely different, independently-selectable period.

export const METRICS_KEY = (since: string, until: string) => ["insights", "metrics", since, until] as const;
export function useMetrics(range: { since: string; until: string } = currentMonthRange()) {
  return useQuery({
    queryKey: METRICS_KEY(range.since, range.until),
    queryFn: () => getMetrics({ query: range }).then((r) => r.data!),
  });
}

export const DAILY_TARGET_KEY = ["insights", "dailyTarget"] as const;
export function useDailyTarget() {
  return useQuery({
    queryKey: DAILY_TARGET_KEY,
    queryFn: () => getDailyTarget().then((r) => r.data!),
  });
}

export const ACCOUNTS_KEY = ["insights", "accounts"] as const;
export function useAccounts() {
  return useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: () => listAccounts().then((r) => r.data!),
  });
}

export const TRANSACTIONS_KEY = (limit: number) => ["insights", "transactions", limit] as const;
export function useTransactions(limit = 5) {
  return useQuery({
    queryKey: TRANSACTIONS_KEY(limit),
    queryFn: () => listTransactions({ query: { limit } }).then((r) => r.data!),
  });
}

export const SPACES_KEY = ["insights", "spaces"] as const;
export function useSpaces() {
  return useQuery({
    queryKey: SPACES_KEY,
    queryFn: () => listSpaces().then((r) => r.data!),
  });
}

// Every `by_currency[]` response array needs a single slice picked for display — the user's
// PRIMARY currency, never silently `[0]` (an explicit choice made with the user: an empty state
// is correct and expected if the primary currency has no data yet, e.g. a fresh account).
export function pickByCurrency<T extends { currency: string }>(
  items: T[] | undefined,
  currency: string | undefined,
): T | undefined {
  if (!items || !currency) return undefined;
  return items.find((item) => item.currency === currency);
}

// Convenience wrapper — every Insights view needs the primary currency to pick its `by_currency[]`
// slice, so this is the ONE call site every card/the wheel uses instead of each destructuring
// `useCurrencyPreferences().data?.primary` by hand.
export function useCurrencyPrimary(): string | undefined {
  const { data } = useCurrencyPreferences();
  return data?.primary;
}

export type { CurrencyMetrics, DailyTargetByCurrency };
