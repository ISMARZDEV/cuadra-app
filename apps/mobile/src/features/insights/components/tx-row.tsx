import { ChevronRight } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Text, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";
import { formatMoney } from "@/lib/money";
import { AKSHAR_MEDIUM } from "@/theme/fonts";

// One row in the Accounts card's Recent Transactions list — an orange strip (same in both
// themes) holding a white circular merchant-emoji badge + an inner row (white light / dark
// #002628 dark) with name, date, amount and a chevron. Exact tokens from Figma's Accounts-card
// node (light 178:11258 / dark 178:12374).
export function TxRow({
  emoji,
  merchantName,
  dateLabel,
  amountMinor,
  currency,
}: {
  emoji: string;
  merchantName: string;
  dateLabel: string;
  amountMinor: number;
  currency: string;
}) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        height: 49,
        backgroundColor: "#FFD4AB",
        borderRadius: 13,
        borderCurve: "continuous",
        paddingLeft: 8,
        paddingRight: 2,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: "white",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 16 }}>{emoji}</Text>
      </View>
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          height: 45,
          marginLeft: 6,
          paddingHorizontal: 8,
          borderRadius: 12,
          borderCurve: "continuous",
          backgroundColor: isDark ? "#002628" : "white",
        }}
      >
        <View style={{ flexShrink: 1 }}>
          <Text style={{ color: isDark ? "#7DE996" : "#034842", fontSize: 10, fontWeight: "700" }}>
            {merchantName}
          </Text>
          <Text style={{ color: isDark ? "white" : "#929292", fontSize: 9, fontWeight: "500" }}>
            {dateLabel}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{
                color: isDark ? "white" : "#008276",
                fontFamily: AKSHAR_MEDIUM,
                fontSize: 12,
              }}
            >
              -{formatMoney(Math.abs(amountMinor), currency)}
            </Text>
            <Text style={{ color: isDark ? "#7DE996" : "#034842", fontSize: 10, fontWeight: "500" }}>
              {t("insights.accounts.spent")}
            </Text>
          </View>
          <Icon as={ChevronRight} size={18} color={isDark ? "#7DE996" : "#034842"} strokeWidth={2.5} />
        </View>
      </View>
    </View>
  );
}
