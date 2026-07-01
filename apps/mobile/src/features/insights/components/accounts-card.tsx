import * as Haptics from "expo-haptics";
import {
  BanknoteArrowDown,
  BanknoteArrowUp,
  PencilSparkles,
  PiggyBank,
  Scale,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

import { Icon } from "@/components/ui/icon";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ScallopFab } from "@/components/ui/scallop-fab";
import { t, useLang } from "@/i18n";

import { pickByCurrency, useAccounts, useCurrencyPrimary, useMetrics, useTransactions } from "../api";
import { InsightsCardShell } from "./insights-card-shell";
import { MoneyTile } from "./money-tile";
import { TxRow } from "./tx-row";

function EditButton({ onPress }: { onPress?: () => void }) {
  const pressScale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressScale.value }] }));
  const onPressIn = () => {
    pressScale.value = withSpring(0.88, { damping: 15, stiffness: 320, mass: 0.6 });
  };
  const onPressOut = () => {
    pressScale.value = withSpring(1, { damping: 11, stiffness: 220, mass: 0.7 });
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel="Edit"
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[
        {
          width: 48,
          height: 48,
          borderRadius: 30,
          backgroundColor: "#C2FB7E",
          alignItems: "center",
          justifyContent: "center",
        },
        animStyle,
      ]}
    >
      <Icon as={PencilSparkles} size={22} color="#034842" strokeWidth={2.5} />
    </AnimatedPressable>
  );
}

function formatTxDate(occurredAt: string): string {
  const date = new Date(occurredAt);
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Card ① Accounts (insights-ui-navbar.md §3) — 4 metric tiles + Recent Transactions, empty state
// (no transactions yet) or populated. Owns its own data fetching (useMetrics/useTransactions),
// per cuadra-mobile's "sections own their state/Query hooks" — the carousel/screen just composes it.
export function AccountsCard() {
  useLang(); // re-render on a language change — t() alone reads a module var, invisible to React

  const primary = useCurrencyPrimary();
  const { data: metrics } = useMetrics();
  const { data: transactions } = useTransactions(5);
  useAccounts(); // prefetched for the wallet-count/currency context other cards read — not used directly here

  const currencyMetrics = pickByCurrency(metrics?.by_currency, primary);
  const currency = currencyMetrics?.currency ?? primary ?? "USD";
  const hasTransactions = (transactions?.length ?? 0) > 0;

  return (
    <InsightsCardShell>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text className="text-text" style={{ fontSize: 14, fontWeight: "500" }}>
            {t("insights.accounts.title")}
          </Text>
          <InfoTooltip label={t("insights.accounts.infoLabel")} message={t("insights.accounts.infoMessage")} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <EditButton onPress={() => {}} />
        <ScallopFab
          label={t("insights.accounts.addTransaction")}
          size={58}
          onPress={() => {}} // TODO(insights-mvp): Add income/expense/transfer form
        />
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
        <View style={{ flex: 1 }}>
          <MoneyTile
            role="income"
            icon={BanknoteArrowDown}
            label={t("insights.accounts.totalIncome")}
            amountMinor={currencyMetrics?.total_income_minor ?? 0}
            currency={currency}
          />
        </View>
        <View style={{ flex: 1 }}>
          <MoneyTile
            role="expense"
            icon={BanknoteArrowUp}
            label={t("insights.accounts.totalBills")}
            amountMinor={-(currencyMetrics?.total_expenses_minor ?? 0)}
            currency={currency}
          />
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <MoneyTile
            role="savings"
            icon={PiggyBank}
            label={t("insights.accounts.savings")}
            amountMinor={currencyMetrics?.savings_minor ?? 0}
            currency={currency}
          />
        </View>
        <View style={{ flex: 1 }}>
          <MoneyTile
            role="balance"
            icon={Scale}
            label={t("insights.accounts.balance")}
            amountMinor={currencyMetrics?.balance_minor ?? 0}
            currency={currency}
          />
        </View>
      </View>

      <View style={{ marginTop: 12 }}>
        {hasTransactions ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text className="text-text" style={{ fontSize: 16, fontWeight: "500" }}>
                {t("insights.accounts.recentTransactions")}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("insights.accounts.seeAll")}
                style={{
                  backgroundColor: "#C2FB7E",
                  borderRadius: 11,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
                onPress={() => {}} // TODO(insights-mvp): full Movimientos/Histórico screen
              >
                <Text style={{ color: "#034842", fontSize: 11, fontWeight: "600" }}>
                  {t("insights.accounts.seeAll")}
                </Text>
              </Pressable>
            </View>
            <View style={{ gap: 7, marginTop: 7 }}>
              {transactions!.map((tx) => (
                <TxRow
                  key={tx.id}
                  emoji={tx.merchant?.name ? "🧾" : "💳"}
                  merchantName={tx.merchant?.name ?? tx.note ?? tx.type}
                  dateLabel={formatTxDate(tx.occurred_at)}
                  amountMinor={tx.amount_minor}
                  currency={tx.currency}
                />
              ))}
            </View>
          </>
        ) : (
          <View style={{ alignItems: "center", gap: 6, paddingVertical: 4 }}>
            <ScallopFab
              label={t("insights.accounts.emptyTitle")}
              size={52}
              onPress={() => {}} // TODO(insights-mvp): Add income/expense/transfer form
            />
            <Text className="text-accent" style={{ fontSize: 15, fontWeight: "700" }}>
              {t("insights.accounts.emptyTitle")}
            </Text>
            <Text className="text-center text-muted" style={{ fontSize: 14, fontWeight: 500, width: 300 }}>
              {t("insights.accounts.emptyDescription")}
            </Text>
          </View>
        )}
      </View>
    </InsightsCardShell>
  );
}
