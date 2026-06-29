import { Pressable, Text, View } from "react-native";

import { GlassSurface } from "@/components/ui/glass-surface";
import { t } from "@/i18n";

import type { ConfirmActionCardProps } from "../interfaces";

// HITL confirmation card (§7.4): the agent staged a write (register an expense, add to a list…)
// and the graph paused at interrupt(). We show the localized summary + Confirm/Cancel; the choice
// is sent to POST /chat/resume. Rendered just above the input bar while `pending` is set.
export function ConfirmActionCard({ summary, onConfirm, onCancel }: ConfirmActionCardProps) {
  return (
    <View className="mx-3 mb-2">
      <GlassSurface style={{ borderRadius: 20, padding: 16 }} intensity={40}>
        <Text className="mb-3 text-base leading-5 text-text">{summary}</Text>
        <View className="flex-row justify-end gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("chat.confirm.cancel")}
            onPress={onCancel}
            className="rounded-full px-4 py-2"
          >
            <Text className="text-base font-semibold text-muted">{t("chat.confirm.cancel")}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("chat.confirm.approve")}
            onPress={onConfirm}
            className="rounded-full bg-primary px-5 py-2"
          >
            <Text className="text-base font-semibold text-white">{t("chat.confirm.approve")}</Text>
          </Pressable>
        </View>
      </GlassSurface>
    </View>
  );
}
