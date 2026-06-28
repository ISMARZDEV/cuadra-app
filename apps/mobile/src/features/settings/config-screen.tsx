import { Moon } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Appearance, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppBackground } from "@/components/ui/app-background";
import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";
import { palette } from "@/theme";

// Config screen. For now: a quick dark/light theme toggle. We drive it through the RN Appearance API
// (NOT NativeWind's setColorScheme) so the NATIVE side switches too — the NativeTabs bar and every
// DynamicColorIOS value follow the same scheme as the NativeWind-styled content. Otherwise the
// native bar stays on the OS appearance and desyncs from the toggled content.
export function ConfigScreen() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  // Drive BOTH theme systems so nothing desyncs: NativeWind (className/AppBackground content) AND
  // the RN Appearance (native NativeTabs bar + every DynamicColorIOS value).
  const applyScheme = (dark: boolean) => {
    const scheme = dark ? "dark" : "light";
    setColorScheme(scheme);
    Appearance.setColorScheme(scheme);
  };

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <AppBackground />
      <View className="px-5 pt-4">
        <Text className="mb-5 text-2xl font-bold text-text">{t("config.title")}</Text>

        <View className="flex-row items-center justify-between rounded-2xl border border-border bg-surface px-4 py-4">
          <View className="flex-row items-center gap-3">
            <Icon as={Moon} size={22} color={palette.primary} />
            <Text className="text-base text-text">{t("config.darkMode")}</Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={applyScheme}
            trackColor={{ true: palette.primary, false: "#9CA3AF" }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
