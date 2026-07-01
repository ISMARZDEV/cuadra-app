import { Calendar } from "lucide-react-native";
import { Text, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";

// Hoy/Semana/Mes/Trimestre pill row (Daily Diary card, Figma). Static this pass — "Hoy" is
// always the visually-active pill, none of them filter the data yet (docs/sdd/insights-home-mvp.md
// — matches currency-preferences.md's already-deferred "Fase 3" for this same kind of dynamism).
const PERIODS = [
  "insights.dailyDiary.period.today",
  "insights.dailyDiary.period.week",
  "insights.dailyDiary.period.month",
  "insights.dailyDiary.period.quarter",
] as const;

export function PeriodSelector() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {PERIODS.map((key, i) => (
        <View
          key={key}
          style={{
            backgroundColor: i === 0 ? "#C2FB7E" : "transparent",
            borderWidth: i === 0 ? 0 : 1,
            borderColor: "#C2FB7E",
            borderRadius: 12,
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <Text
            style={{ fontSize: 11, fontWeight: "600", color: i === 0 ? "#034842" : "#C2FB7E" }}
          >
            {t(key)}
          </Text>
        </View>
      ))}
      <Icon as={Calendar} size={18} color="#C2FB7E" strokeWidth={2.5} />
    </View>
  );
}
