import { ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppBackground } from "@/components/ui/app-background";
import { t, useLang } from "@/i18n";
import { KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

// La home de Supermarket. FASE 1: solo el destino, para que el hub tenga a dónde navegar y la ruta
// exista de verdad. El header curvo, los círculos de categoría y los dos rails llegan en la Fase 5.
export function SupermarketHomeScreen() {
  useLang();

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <AppBackground />
      <ScrollView contentContainerClassName="px-5 pb-10 pt-4">
        <Text className="text-2xl text-text" style={{ fontFamily: KANTUMRUY_SEMIBOLD }}>
          {t("save.supermarket.title")}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
