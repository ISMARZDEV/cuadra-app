import type {
  AccountResponse,
  CurrencyPreferencesResponse,
  DailyTarget,
  InsightsMetrics,
  TransactionResponse,
} from "@cuadra/api-client";
import type { QueryClient } from "@tanstack/react-query";

import { CURRENCY_PREFERENCES_KEY } from "@/lib/hooks/use-currency-preferences";

import {
  ACCOUNTS_KEY,
  DAILY_TARGET_KEY,
  METRICS_KEY,
  TRANSACTIONS_KEY,
} from "./api";
import { currentMonthRange } from "./date-range";
import type { WheelBand } from "./interfaces";

// Dev-only design-preview mock (cuadra-mobile §3 — sections own their state/Query hooks; this
// owns nothing new, it just SEEDS the exact cache keys those hooks already read). Every field
// name/shape below is copied straight from the generated SDK (packages/api-client/src/generated/
// types.gen.ts), so when the real per-category-spend endpoint ships, this file is deleted and
// NOTHING else changes — the hooks, components, and query keys are untouched either way.
const MOCK_CURRENCY = "USD";

const MOCK_CURRENCY_PREFERENCES: CurrencyPreferencesResponse = {
  primary: MOCK_CURRENCY,
  extra: ["DOP"],
  all: ["USD", "DOP"],
};

const MOCK_METRICS: InsightsMetrics = {
  by_currency: [
    {
      currency: MOCK_CURRENCY,
      total_income_minor: 2_035_000, // $20,350.00
      total_expenses_minor: 1_600_000, // $16,000.00 — ~84% of budget, so the wheel's colored arc
      // fills MOST but not all of the sweep (see MOCK_DAILY_TARGET below: the arc's fill % is
      // driven by spent/budget, not a fixed value — this only LOOKS full because it's close).
      balance_minor: 435_000, // $4,350.00
      total_balance_minor: 435_000,
      net_worth_minor: 435_000,
      savings_minor: 0,
    },
  ],
};

const MOCK_DAILY_TARGET: DailyTarget = {
  by_currency: [
    {
      currency: MOCK_CURRENCY,
      monthly_limit_minor: 1_900_000, // Budget $19,000.00
      spent_month_minor: 1_600_000, // Total Expense $16,000.00 — insights-wheel.tsx fills the
      // colored arc to spent/budget (~84% here), NOT the full sweep; only reaching/exceeding the
      // budget closes the ring completely.
      remaining_minor: 300_000,
      days_remaining: 20,
      daily_target_minor: 135_000, // Daily Target Spending $1,350.00
      spent_today_minor: 35_000, // You spent today -$350.00
    },
  ],
};

const MOCK_ACCOUNTS: AccountResponse[] = [
  { id: "mock-acc-dop", type: "debit_card", currency: "DOP", name: "Cuenta Corriente", icon: null, balance_minor: 5_000_000_00 },
  { id: "mock-acc-usd", type: "cash", currency: "USD", name: "Efectivo", icon: null, balance_minor: 50_000 },
];

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

const MOCK_TRANSACTIONS: TransactionResponse[] = [
  {
    id: "mock-tx-spotify",
    type: "expense",
    amount_minor: -35_000, // -$350.00
    currency: MOCK_CURRENCY,
    account_id: "mock-acc-usd",
    counter_account_id: "",
    occurred_at: daysAgoIso(0),
    source: "mock",
    merchant: { name: "Spotify Suscriptions" },
  },
  {
    id: "mock-tx-shell",
    type: "expense",
    amount_minor: -50_000, // -$500.00
    currency: MOCK_CURRENCY,
    account_id: "mock-acc-usd",
    counter_account_id: "",
    occurred_at: daysAgoIso(21),
    source: "mock",
    merchant: { name: "Shell" },
  },
];

// The wheel's category bands have NO backend endpoint yet (interfaces.ts: "deferred data this
// pass" — the prop shape is already final, so wiring the real per-category breakdown later is a
// values-only change). Kept here, not seeded via queryClient, since there's no query key for them
// to occupy — insights-wheel.tsx reads these directly from the dev-mock store instead. Each band's
// own `emoji` badge is pinned by insights-wheel.tsx at the END of THIS band's own arc segment
// (never centered inside it) — order here only affects which category sits next to which along
// the arc, not correctness.
export const MOCK_WHEEL_TREND_PERCENT = 30;

// Pastel palette (softer than vivid alert tones, but still rich enough to read against the dark
// blob) — matches DEFAULT_BANDS' palette in insights-wheel.tsx.
export const MOCK_WHEEL_BANDS: WheelBand[] = [
  { colorHex: "#F5A876", weight: 0.9, emoji: "🎵", ringColor: "#F5A876" }, // music — pastel orange
  { colorHex: "#F5D76E", weight: 1.1, emoji: "🍔", ringColor: "#F5D76E" }, // burger — pastel yellow
  { colorHex: "#C9A06B", weight: 1.0, emoji: "🐶", ringColor: "#C9A06B" }, // dog — pastel tan
  { colorHex: "#F08080", weight: 1.4, emoji: "🚗", ringColor: "#F08080" }, // car — pastel red
];

// Seeds every Insights query key the real hooks read (api.ts) — every card flips to "populated"
// together, with zero component changes. Swapping in the real backend later is: stop calling
// this, nothing else changes.
export function seedMockInsights(queryClient: QueryClient): void {
  const { since, until } = currentMonthRange();
  queryClient.setQueryData(CURRENCY_PREFERENCES_KEY, MOCK_CURRENCY_PREFERENCES);
  queryClient.setQueryData(METRICS_KEY(since, until), MOCK_METRICS);
  queryClient.setQueryData(DAILY_TARGET_KEY, MOCK_DAILY_TARGET);
  queryClient.setQueryData(ACCOUNTS_KEY, MOCK_ACCOUNTS);
  queryClient.setQueryData(TRANSACTIONS_KEY(5), MOCK_TRANSACTIONS);
}

// Removes (not just invalidates) the same keys so every card goes back to its own real "no data
// yet" empty state IMMEDIATELY. `invalidateQueries` alone would just trigger a background refetch
// and keep showing the stale MOCK numbers on screen until that refetch resolves — which, without
// a reachable dev backend/session, may never happen, leaving a confusing half-mock screen (mock
// dollar figures with no mock category bands, since the wheel's bands DO react instantly to the
// store's `enabled` flag). Removing forces every hook back to `data: undefined` right away.
export function clearMockInsights(queryClient: QueryClient): void {
  const { since, until } = currentMonthRange();
  queryClient.removeQueries({ queryKey: CURRENCY_PREFERENCES_KEY });
  queryClient.removeQueries({ queryKey: METRICS_KEY(since, until) });
  queryClient.removeQueries({ queryKey: DAILY_TARGET_KEY });
  queryClient.removeQueries({ queryKey: ACCOUNTS_KEY });
  queryClient.removeQueries({ queryKey: TRANSACTIONS_KEY(5) });
}
