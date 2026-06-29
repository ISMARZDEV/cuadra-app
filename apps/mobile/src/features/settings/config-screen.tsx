import { useRouter } from "expo-router";
import { ChevronRight, Languages, Moon, Sparkles } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";
import { palette } from "@/theme";

// Config screen: dark/light toggle + a row that opens the copilot personality selector (a nested
// screen in the Config stack, so the tab bar stays — back via its arrow OR the Config tab).
export function ConfigScreen() {
  const router = useRouter();
  const { colorScheme, setColorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <View className="px-5 pt-4">
        <Text className="mb-5 text-2xl font-bold text-text">{t("config.title")}</Text>

        <View className="flex-row items-center justify-between rounded-2xl border border-border bg-surface px-4 py-4">
          <View className="flex-row items-center gap-3">
            <Icon as={Moon} size={22} color={palette.primary} />
            <Text className="text-base text-text">{t("config.darkMode")}</Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={(v) => setColorScheme(v ? "dark" : "light")}
            trackColor={{ true: palette.primary, false: "#9CA3AF" }}
            thumbColor="#FFFFFF"
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("config.personality")}
          onPress={() => router.push("/config/personality")}
          className="mt-3 flex-row items-center justify-between rounded-2xl border border-border bg-surface px-4 py-4"
        >
          <View className="flex-row items-center gap-3">
            <Icon as={Sparkles} size={22} color={palette.primary} />
            <Text className="text-base text-text">{t("config.personality")}</Text>
          </View>
          <Icon as={ChevronRight} size={22} color="#9CA3AF" />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("config.language")}
          onPress={() => router.push("/config/language")}
          className="mt-3 flex-row items-center justify-between rounded-2xl border border-border bg-surface px-4 py-4"
        >
          <View className="flex-row items-center gap-3">
            <Icon as={Languages} size={22} color={palette.primary} />
            <Text className="text-base text-text">{t("config.language")}</Text>
          </View>
          <Icon as={ChevronRight} size={22} color="#9CA3AF" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
