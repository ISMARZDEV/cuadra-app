import * as Haptics from "expo-haptics";
import {
  BanknoteArrowDown,
  BanknoteArrowUp,
  Maximize2,
  PencilSparkles,
  PiggyBank,
  Scale,
} from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

import { Icon } from "@/components/ui/icon";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ScallopFab } from "@/components/ui/scallop-fab";
import { t, useLang } from "@/i18n";

import { pickByCurrency, useAccounts, useCurrencyPrimary, useMetrics, useTransactions } from "../api";
import { InsightsCardShell } from "./insights-card-shell";
import type { BrandKey } from "./merchant-brand";
import { MoneyTile } from "./money-tile";
import { TxRowItem } from "./tx-row-item";

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
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: "#C2FB7E",
          alignItems: "center",
          justifyContent: "center",
        },
        animStyle,
      ]}
    >
      <Icon as={PencilSparkles} size={19} color="#034842" strokeWidth={2.5} />
    </AnimatedPressable>
  );
}

function formatTxDate(occurredAt: string): string {
  const date = new Date(occurredAt);
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Display-layer merchant → {category emoji + ring color, category parent/child names, brand SVG key
// / emoji} mapping. `categoryChild` is optional (a tx may only have a parent category). Real
// transactions carry `merchant.logo_url` + real category data; a `brandKey` points at a local SVG
// in public/brands/ (see merchant-brand.tsx); `brandEmoji` is the last-resort stand-in. Keyed
// loosely by name substring. Category names are t()'d — AccountsCard calls useLang() so a language
// change re-renders this.
function merchantVisuals(name: string): {
  emoji: string;
  ringColor: string;
  categoryParent: string;
  categoryChild?: string;
  brandKey?: BrandKey;
  brandEmoji?: string;
} {
  const n = name.toLowerCase();
  if (n.includes("spotify"))
    return {
      emoji: "🎵",
      ringColor: "#F4A8A8",
      categoryParent: t("insights.categories.entertainment"),
      categoryChild: t("insights.categories.music"),
      brandKey: "spotify",
    };
  if (n.includes("shell"))
    return {
      emoji: "⛽",
      ringColor: "#F5A876",
      categoryParent: t("insights.categories.transport"),
      categoryChild: t("insights.categories.fuel"),
      brandKey: "shell",
    };
  if (n.includes("uber"))
    return {
      emoji: "🚗",
      ringColor: "#F08080",
      categoryParent: t("insights.categories.transport"),
      categoryChild: t("insights.categories.rides"),
      brandEmoji: "🚕",
    };
  if (n.includes("amazon"))
    return {
      emoji: "📦",
      ringColor: "#F5D76E",
      categoryParent: t("insights.categories.shopping"),
      brandEmoji: "🛒",
    };
  return { emoji: "🧾", ringColor: "#6FD99A", categoryParent: t("insights.categories.other") };
}

// The lime round expand button that replaces the old "Ver todo" text pill (Figma) — animated +
// haptic, opens the full Movimientos/Histórico screen.
function ExpandButton({ onPress, label }: { onPress?: () => void; label: string }) {
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
      accessibilityLabel={label}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[
        {
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: "#C2FB7E",
          alignItems: "center",
          justifyContent: "center",
        },
        animStyle,
      ]}
    >
      <Icon as={Maximize2} size={18} color="#034842" strokeWidth={2.5} />
    </AnimatedPressable>
  );
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
          <Text className="text-text" style={{ fontSize: 18, fontWeight: "600" }}>
            {t("insights.accounts.title")}
          </Text>
          <InfoTooltip label={t("insights.accounts.infoLabel")} message={t("insights.accounts.infoMessage")} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <EditButton onPress={() => {}} />
        <ScallopFab
          label={t("insights.accounts.addTransaction")}
          size={48}
          onPress={() => {}} // TODO(insights-mvp): Add income/expense/transfer form
        />
        </View>
      </View>

      {/* 2-column grid via flexWrap + a FIXED 48.5% width per tile (not flex:1 per row) — this is
          what guarantees ALL FOUR tiles are exactly the same width and the two columns line up.
          Two independent flex rows drifted out of alignment because each row distributed its own
          width based on its own content; a fixed-percentage wrapping grid can't. Long amounts
          truncate with "…" inside the tile (MoneyTile's numberOfLines) rather than widening it. */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          rowGap: 8,
          marginTop: 10,
        }}
      >
        <View style={{ width: "48.5%" }}>
          <MoneyTile
            role="income"
            icon={BanknoteArrowDown}
            label={t("insights.accounts.totalIncome")}
            amountMinor={currencyMetrics?.total_income_minor ?? 0}
            currency={currency}
          />
        </View>
        <View style={{ width: "48.5%" }}>
          <MoneyTile
            role="expense"
            icon={BanknoteArrowUp}
            label={t("insights.accounts.totalBills")}
            amountMinor={-(currencyMetrics?.total_expenses_minor ?? 0)}
            currency={currency}
          />
        </View>
        <View style={{ width: "48.5%" }}>
          <MoneyTile
            role="savings"
            icon={PiggyBank}
            label={t("insights.accounts.savings")}
            amountMinor={currencyMetrics?.savings_minor ?? 0}
            currency={currency}
          />
        </View>
        <View style={{ width: "48.5%" }}>
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
              <Text className="text-text" style={{ fontSize: 18, fontWeight: "600" }}>
                {t("insights.accounts.recentTransactions")}
              </Text>
              <ExpandButton
                label={t("insights.accounts.seeAll")}
                onPress={() => {}} // TODO(insights-mvp): full Movimientos/Histórico screen
              />
            </View>
            <View style={{ gap: 10, marginTop: 10 }}>
              {transactions!.map((tx) => {
                const name = tx.merchant?.name ?? tx.note ?? tx.type;
                const { emoji, ringColor, categoryParent, categoryChild, brandKey, brandEmoji } =
                  merchantVisuals(name);
                return (
                  <TxRowItem
                    key={tx.id}
                    emoji={emoji}
                    categoryRingColor={ringColor}
                    categoryParent={categoryParent}
                    categoryChild={categoryChild}
                    brandKey={brandKey}
                    brandLogoUrl={tx.merchant?.logo_url ?? undefined}
                    brandEmoji={brandEmoji}
                    merchantName={name}
                    dateLabel={formatTxDate(tx.occurred_at)}
                    amountMinor={tx.amount_minor}
                    currency={tx.currency}
                    onPress={() => {}} // TODO(insights-mvp): open this transaction's detail
                    onEdit={() => {}} // TODO(insights-mvp): edit this transaction
                    onDelete={() => {}} // TODO(insights-mvp): delete this transaction (confirm)
                  />
                );
              })}
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
