import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppBackground } from "@/components/ui/app-background";
import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";
import { palette } from "@/theme";

import { usePersonality, useSetPersonality } from "./api";
import { PersonalityOption } from "./components/personality-option";
import { PERSONALITY_OPTIONS } from "./personality-options";

// Copilot personality selector (reached from Config → "Personalidad del copiloto"). Back via the
// arrow (router.back) OR by tapping Config in the tab bar (the screen lives in the Config stack).
export function PersonalityScreen() {
  const router = useRouter();
  const { data: current } = usePersonality();
  const { mutate: setPersonality } = useSetPersonality();

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      {/* Self-paints the shared gradient — see language-screen.tsx for why (expo/expo#33040). */}
      <AppBackground />
      <View className="flex-row items-center gap-1 px-3 pt-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("personality.a11y.back")}
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-full"
        >
          <Icon as={ChevronLeft} size={26} color={palette.primary} />
        </Pressable>
        <Text className="text-2xl font-bold text-text">{t("personality.title")}</Text>
      </View>
      <Text className="px-5 pb-4 pt-1 text-sm text-muted">{t("personality.subtitle")}</Text>

      <View className="px-5">
        {PERSONALITY_OPTIONS.map((option) => (
          <PersonalityOption
            key={option.id}
            option={option}
            selected={current === option.id}
            onPress={() => setPersonality(option.id)}
          />
        ))}
      </View>
    </SafeAreaView>
  );
}
