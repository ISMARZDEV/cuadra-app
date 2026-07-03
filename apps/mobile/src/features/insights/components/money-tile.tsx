import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, Text } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/money";
import { AKSHAR_SEMIBOLD } from "@/theme/fonts";
import { MONEY_ROLE_COLORS, type MoneyRole } from "@/theme/money-role-colors";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// One of the Accounts card's 4 metric tiles — theme-inverted bg/text via the SAME
// MONEY_ROLE_COLORS constant chat-empty-state.tsx's widgets use, so the two features read as one
// visual language. Icons reuse chat's exact role→icon pairing for the same reason. Each tile is a
// BUTTON: press-scale + haptic (same feel as the wheel's buttons); tapping opens a detail modal.
export function MoneyTile({
  role,
  icon,
  label,
  amountMinor,
  currency,
  onPress,
}: {
  role: MoneyRole;
  icon: LucideIcon;
  label: string;
  amountMinor: number;
  currency: string;
  onPress?: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = MONEY_ROLE_COLORS[role];
  const bg = isDark ? colors.dark : colors.light;
  const fg = isDark ? colors.light : colors.dark;
  const sign = amountMinor > 0 ? "+ " : "";

  const pressScale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressScale.value }] }));
  const onPressIn = () => {
    pressScale.value = withSpring(0.94, { damping: 15, stiffness: 320, mass: 0.6 });
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
        // TODO(insights-mvp): open a detail modal for this role (income/expense/savings/balance)
        // showing the full amount + its breakdown.
        onPress?.();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[
        {
          height: 42,
          backgroundColor: bg,
          borderRadius: 10,
          borderCurve: "continuous",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 10,
          overflow: "hidden",
        },
        animStyle,
      ]}
    >
      <Animated.View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text style={{ color: fg, fontSize: 12, fontWeight: "600" }} numberOfLines={1}>
          {label}
        </Text>
        {/* Tile height is fixed (42, above) — a long amount (big number, wide currency, large
            system font size) must never wrap or push the tile taller. Truncate with "…" instead. */}
        <Text
          style={{ color: fg, fontFamily: AKSHAR_SEMIBOLD, fontSize: 16 }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {sign}
          {formatMoney(amountMinor, currency)}
        </Text>
      </Animated.View>
      <Icon as={icon} size={24} color={fg} strokeWidth={2.5} />
    </AnimatedPressable>
  );
}
