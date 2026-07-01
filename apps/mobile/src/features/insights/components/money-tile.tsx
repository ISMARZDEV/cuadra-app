import type { LucideIcon } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Text, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/money";
import { AKSHAR_SEMIBOLD } from "@/theme/fonts";
import { MONEY_ROLE_COLORS, type MoneyRole } from "@/theme/money-role-colors";

// One of the Accounts card's 4 metric tiles (2x2 grid) — theme-inverted bg/text via the SAME
// MONEY_ROLE_COLORS constant chat-empty-state.tsx's widgets use, so the two features read as one
// visual language. Icons reuse chat's exact role→icon pairing for the same reason.
export function MoneyTile({
  role,
  icon,
  label,
  amountMinor,
  currency,
}: {
  role: MoneyRole;
  icon: LucideIcon;
  label: string;
  amountMinor: number;
  currency: string;
}) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = MONEY_ROLE_COLORS[role];
  const bg = isDark ? colors.dark : colors.light;
  const fg = isDark ? colors.light : colors.dark;
  const sign = amountMinor > 0 ? "+ " : "";

  return (
    <View
      style={{
        flex: 1,
        height: 42,
        backgroundColor: bg,
        borderRadius: 10,
        borderCurve: "continuous",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 10,
      }}
    >
      <View style={{ flexShrink: 1 }}>
        <Text style={{ color: fg, fontSize: 10, fontWeight: "500" }}>{label}</Text>
        <Text style={{ color: fg, fontFamily: AKSHAR_SEMIBOLD, fontSize: 14 }}>
          {sign}
          {formatMoney(amountMinor, currency)}
        </Text>
      </View>
      <Icon as={icon} size={22} color={fg} />
    </View>
  );
}
