import { Trash2 } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";
import { formatMoney } from "@/lib/money";
import { palette } from "@/theme";

import type { SubscriptionRowProps } from "../interfaces";

// Fila de una suscripción: producto seguido + umbral opcional + dejar de seguir.
export function SubscriptionRow({ alert, onRemove }: SubscriptionRowProps) {
  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
      <View className="flex-1">
        <Text className="text-base text-text">{alert.product_name}</Text>
        {alert.threshold_minor != null && (
          <Text className="text-xs text-muted">≤ {formatMoney(alert.threshold_minor, "DOP")}</Text>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("save.alerts.unsubscribe")}
        onPress={() => onRemove(alert.id)}
        hitSlop={8}
      >
        <Icon as={Trash2} size={20} color={palette.danger} />
      </Pressable>
    </View>
  );
}
