import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Pressable, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppBackground } from "@/components/ui/app-background";
import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";
import { palette } from "@/theme";

import { SelectableRow } from "./components/selectable-row";
import { LANGUAGE_OPTIONS } from "./language-options";
import { useLanguageStore } from "./use-language-store";

// App language selector (Config → Idioma). A switch follows the system language; turning it off
// reveals the es/en/pt picker. Drives the whole app's i18n and the chat reply language.
export function LanguageScreen() {
  const router = useRouter();
  const auto = useLanguageStore((s) => s.auto);
  const lang = useLanguageStore((s) => s.lang);
  const setAuto = useLanguageStore((s) => s.setAuto);
  const setLang = useLanguageStore((s) => s.setLang);

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      {/* Self-paints the shared gradient (not just relying on the root layer showing through) —
          react-native-screens' native stack doesn't hide the outgoing screen behind a transparent
          incoming one during push/pop, so both screens' content ghosts together mid-transition
          (expo/expo#33040, unresolved upstream). Each pushed screen must be visually self-contained. */}
      <AppBackground />
      <View className="flex-row items-center gap-1 px-3 pt-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("language.a11y.back")}
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-full"
        >
          <Icon as={ChevronLeft} size={26} color={palette.primary} />
        </Pressable>
        <Text className="text-2xl font-bold text-text">{t("language.title")}</Text>
      </View>
      <Text className="px-5 pb-4 pt-1 text-sm text-muted">{t("language.subtitle")}</Text>

      <View className="px-5">
        <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-border bg-surface px-4 py-4">
          <Text className="flex-1 text-base text-text">{t("language.auto")}</Text>
          <Switch
            accessibilityLabel={t("language.auto")}
            value={auto}
            onValueChange={setAuto}
            trackColor={{ true: palette.primary, false: "#9CA3AF" }}
            thumbColor="#FFFFFF"
          />
        </View>

        {auto
          ? null
          : LANGUAGE_OPTIONS.map((option) => (
              <SelectableRow
                key={option.id}
                leading={<Text className="text-3xl">{option.flag}</Text>}
                label={option.label}
                selected={lang === option.id}
                onPress={() => setLang(option.id)}
              />
            ))}
      </View>
    </SafeAreaView>
  );
}
