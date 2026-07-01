import { ScrollView, View } from "react-native";

import { pickByCurrency, useCurrencyPrimary, useDailyTarget } from "./api";
import { AccountsCard } from "./components/accounts-card";
import { DailyDiaryCard } from "./components/daily-diary-card";
import { InsightsCarousel } from "./components/insights-carousel";
import { InsightsWheel } from "./components/insights-wheel";
import { SpacesCard } from "./components/spaces-card";

// Insights home (insights-ui-navbar.md) — the persistent wheel (which owns its own 7 surrounding
// buttons — they live in the SAME coordinate space as the ring per the reference design, not a
// separate row) + the 3-card carousel (Accounts/Spaces/Daily Diary). Composition only, per
// cuadra-mobile's "keep screens lean" — each piece owns its own data fetching. Transparent → the
// root AppBackground gradient shows through, same as every other top-level tab (chat-screen.tsx).
export function InsightsScreen() {
  const primary = useCurrencyPrimary();
  const { data: dailyTarget } = useDailyTarget();
  const targetForPrimary = pickByCurrency(dailyTarget?.by_currency, primary);
  // "Has activity" = there's a monthly limit set for the primary currency at all — matches the
  // Figma empty-state copy ("your financial activity will appear here"), not a zero-vs-nonzero
  // spend check (a user who set a budget but spent $0 yet still has a populated wheel to show).
  const hasActivity = targetForPrimary !== undefined;

  return (
    <ScrollView contentContainerStyle={{ alignItems: "center", paddingTop: 40, paddingBottom: 32 }}>
      <InsightsWheel
        variant={hasActivity ? "populated" : "empty"}
        totalExpenseMinor={targetForPrimary?.spent_month_minor ?? 0}
        budgetMinor={targetForPrimary?.monthly_limit_minor ?? 0}
        currency={targetForPrimary?.currency ?? primary ?? "USD"}
        onAddPress={() => {}} // TODO(insights-mvp): Add income/expense/transfer form
      />
      <View style={{ width: "100%", marginTop: 12, paddingHorizontal: 12 }}>
        <InsightsCarousel>
          <AccountsCard />
          <SpacesCard />
          <DailyDiaryCard />
        </InsightsCarousel>
      </View>
    </ScrollView>
  );
}
