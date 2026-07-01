import * as Haptics from "expo-haptics";
import { PencilSparkles, Star } from "lucide-react-native";
import { Image, Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

import { Icon } from "@/components/ui/icon";
import { ScallopFab } from "@/components/ui/scallop-fab";
import { t, useLang } from "@/i18n";
import { formatMoney } from "@/lib/money";
// ESM import (not require()) — a static-asset require() compiles to a literal Node require() call
// at test runtime, which bypasses Vite's resolve.alias (and the "@/" path) entirely; import goes
// through Vite's own resolution, which DOES honor the alias (and Metro supports both for assets).
import illustration from "@/public/img/insights-daily-diary-empty.png";
import { AKSHAR_MEDIUM, AKSHAR_SEMIBOLD } from "@/theme/fonts";

import { useAccounts, useCurrencyPrimary, useDailyTarget, pickByCurrency } from "../api";
import { InsightsCardShell } from "./insights-card-shell";
import { PeriodSelector } from "./period-selector";

const RING_SIZE = 44;
const RING_STROKE = 5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

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
      <Icon as={PencilSparkles} size={22} color="#034842" strokeWidth={2.5} />
    </AnimatedPressable>
  );
}

function TargetRing({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = RING_CIRCUMFERENCE * (1 - clamped / 100);
  return (
    <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: "center", justifyContent: "center" }}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: "absolute" }}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke="#3A3F3D"
          strokeOpacity={0.25}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke="#C2FB7E"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          fill="none"
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </Svg>
      <Icon as={Star} size={18} color="#C2FB7E" strokeWidth={2.5} />
    </View>
  );
}

function WalletStack() {
  return (
    <View
      style={{
        height: 60,
        borderRadius: 12,
        borderCurve: "continuous",
        backgroundColor: "#2E5FD9",
        paddingHorizontal: 14,
        justifyContent: "flex-end",
        paddingBottom: 8,
        marginBottom: 8,
      }}
    >
      <Text style={{ color: "white", fontWeight: "700", fontStyle: "italic", fontSize: 14 }}>VISA</Text>
    </View>
  );
}

// Card ③ Daily Diary (insights-ui-navbar.md §3) — wallet stack, DOP/USD balance on separate
// lines (never summed — §12·B), Daily Target Spending / You spent today + a progress ring. Empty
// (no wallets yet) or populated. Owns its own data fetching, per cuadra-mobile's "sections own
// their state/Query hooks".
export function DailyDiaryCard() {
  useLang(); // re-render on a language change — t() alone reads a module var, invisible to React

  const primary = useCurrencyPrimary();
  const { data: accounts } = useAccounts();
  const { data: dailyTarget } = useDailyTarget();

  const hasWallets = (accounts?.length ?? 0) > 0;
  const targetForPrimary = pickByCurrency(dailyTarget?.by_currency, primary);
  const targetPercent =
    targetForPrimary && targetForPrimary.daily_target_minor > 0
      ? (targetForPrimary.spent_today_minor / targetForPrimary.daily_target_minor) * 100
      : 0;

  const balanceByCurrency = new Map<string, number>();
  for (const account of accounts ?? []) {
    balanceByCurrency.set(account.currency, (balanceByCurrency.get(account.currency) ?? 0) + account.balance_minor);
  }

  return (
    <InsightsCardShell>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text className="text-text" style={{ fontSize: 16, fontWeight: "500" }}>
            {t("insights.dailyDiary.title")}
          </Text>
          <Text style={{ fontSize: 16 }}>🏡</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ flexDirection: "row", backgroundColor: "#C2FB7E", borderRadius: 12, padding: 2 }}>
            <View style={{ backgroundColor: "#034842", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: "#C2FB7E", fontSize: 10, fontWeight: "700" }}>DOP</Text>
            </View>
            <View style={{ paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: "#034842", fontSize: 10, fontWeight: "700" }}>USD</Text>
            </View>
          </View>
          <EditButton onPress={() => {}} />
        </View>
      </View>

      {hasWallets ? (
        <View style={{ marginTop: 12 }}>
          <WalletStack />
          <View>
            <Text className="text-text" style={{ fontSize: 13, fontWeight: "500" }}>
              {t("insights.dailyDiary.totalBalance")}
            </Text>
            {[...balanceByCurrency.entries()].map(([currency, amountMinor]) => (
              <Text
                key={currency}
                className="text-text"
                style={{ fontFamily: AKSHAR_MEDIUM, fontSize: 15, marginTop: 2 }}
              >
                {currency} {formatMoney(amountMinor, currency)}
              </Text>
            ))}
            <Text className="text-muted" style={{ fontSize: 10, marginTop: 2 }}>
              {accounts!.length} {t("insights.dailyDiary.walletsSummary")}
            </Text>
          </View>

          <View style={{ marginTop: 10 }}>
            <PeriodSelector />
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 10,
            }}
          >
            <View>
              <Text className="text-muted" style={{ fontSize: 11 }}>
                {t("insights.dailyDiary.dailyTarget")}
              </Text>
              <Text
                className="text-text"
                style={{ fontFamily: AKSHAR_SEMIBOLD, fontSize: 16 }}
              >
                {formatMoney(targetForPrimary?.daily_target_minor ?? 0, primary ?? "USD")}
              </Text>
            </View>
            <View>
              <Text className="text-muted" style={{ fontSize: 11 }}>
                {t("insights.dailyDiary.spentToday")}
              </Text>
              <Text
                style={{ fontFamily: AKSHAR_SEMIBOLD, fontSize: 16, color: "#EB5757" }}
              >
                -{formatMoney(targetForPrimary?.spent_today_minor ?? 0, primary ?? "USD")}
              </Text>
            </View>
            <TargetRing percent={targetPercent} />
          </View>
        </View>
      ) : (
        <View style={{ alignItems: "center", gap: 6, marginTop: 12 }}>
          <ScallopFab
            label={t("insights.dailyDiary.emptyTitle")}
            size={52}
            onPress={() => {}} // TODO(insights-mvp): Add Wallet form (cuadra-mobile-forms)
          />
          <Text className="text-accent" style={{ fontSize: 15, fontWeight: "700" }}>
            {t("insights.dailyDiary.emptyTitle")}
          </Text>
          <Text className="text-center text-muted" style={{ fontSize: 12, marginBottom: 8 }}>
            {t("insights.dailyDiary.emptyDescription")}
          </Text>
          <Image source={illustration} style={{ width: 160, height: 110 }} resizeMode="contain" />
        </View>
      )}
    </InsightsCardShell>
  );
}
