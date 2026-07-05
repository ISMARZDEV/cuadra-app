import { Text, View } from "react-native";

import { t, useLang } from "@/i18n";
import { formatMoney } from "@/lib/money";

import type { NotificationCardProps } from "../interfaces";

// Tarjeta de una alerta disparada (feed in-app): producto + "bajó de X a Y en Z" + −%.
export function NotificationCard({ notification: n }: NotificationCardProps) {
  useLang(); // re-render en vivo al cambiar idioma (skill cuadra-mobile §5, reactividad de t())
  return (
    <View className="rounded-2xl border border-border bg-surface px-4 py-3">
      <Text className="text-base font-semibold text-text">{n.product_name}</Text>
      <Text className="mt-0.5 text-sm text-muted">
        {t("save.alerts.droppedFromTo", {
          from: formatMoney(n.previous_minor, n.currency),
          to: formatMoney(n.current_minor, n.currency),
          store: n.provider_name,
        })}{"  "}
        <Text className="font-semibold text-primary">−{(n.drop_bps / 100).toFixed(1)}%</Text>
      </Text>
    </View>
  );
}
