import { Moon } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";
import { palette } from "@/theme";

// Config screen. For now: a quick dark/light theme toggle (NativeWind setColorScheme overrides the
// system scheme app-wide for the session).
export function ConfigScreen() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
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
      </View>
    </SafeAreaView>
  );
}
