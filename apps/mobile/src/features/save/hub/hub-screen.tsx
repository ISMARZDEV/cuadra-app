import { Bell } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";

import { AppBackground } from "@/components/ui/app-background";
import { Icon } from "@/components/ui/icon";
import { palette } from "@/theme";
import { t, useLang } from "@/i18n";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import type { Vertical } from "../interfaces";
import { VerticalCard } from "./components/vertical-card";
import { VERTICALS } from "./verticals";

// El hub de Save: los pilares del comparador. NO trae datos — es navegación pura, y por eso no
// depende de ningún endpoint.
//
// FASE 1 (esqueleto): la lista funciona y respeta el contrato `live`/`soon`. El card con la
// ilustración, la estrella y la guirnalda del diseño llega en la Fase 2.
export function HubScreen() {
  useLang(); // re-render en vivo al cambiar idioma
  const router = useRouter();
  const [pending, setPending] = useState<Vertical | null>(null);

  const open = (vertical: Vertical) => {
    // Una vertical sin datos NO navega: mandarla a una pantalla vacía es prometer algo que no
    // existe. Abre su promesa concreta — qué va a poder preguntar el día que llegue.
    if (vertical.status === "live" && vertical.href) {
      router.push(vertical.href);
      return;
    }
    setPending(vertical);
  };

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <AppBackground />
      <ScrollView contentContainerClassName="px-5 pb-10 pt-4">
        {/* La campana es el ÚNICO acceso al feed de alertas desde que dejó de ser la pantalla de
            Save. En el diseño vive arriba a la derecha, como botón de vidrio; acá va plana hasta
            la Fase 2. Sin esto, mover el feed lo habría dejado inalcanzable. */}
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-2xl text-text" style={{ fontFamily: KANTUMRUY_SEMIBOLD }}>
            {t("save.hub.title")}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("save.alerts.title")}
            onPress={() => router.push("/save/alerts" as Href)}
            hitSlop={8}
            className="rounded-full bg-primary/15 p-2"
          >
            <Icon as={Bell} size={22} color={palette.primary} />
          </Pressable>
        </View>

        <View className="gap-[19px]">
          {VERTICALS.map((vertical) => (
            <VerticalCard key={vertical.id} vertical={vertical} onPress={open} />
          ))}
        </View>

        {/* Estado «en construcción»: dice QUÉ va a responder esa vertical. Un «próximamente» vacío
            no le sirve a nadie; esto convierte una ausencia en una promesa concreta. */}
        {pending ? (
          <View className="mt-6 rounded-2xl bg-card px-4 py-5" style={{ borderCurve: "continuous" }}>
            <Text className="text-base text-text" style={{ fontFamily: KANTUMRUY_SEMIBOLD }}>
              {t("save.hub.soon.title", { vertical: pending.title })}
            </Text>
            <Text
              className="mt-1 text-sm text-text/60"
              style={{ fontFamily: KANTUMRUY_MEDIUM }}
            >
              {t(pending.blurbKey)}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPending(null)}
              className="mt-3 self-start rounded-full bg-primary/15 px-4 py-2"
            >
              <Text className="text-sm text-primary" style={{ fontFamily: KANTUMRUY_SEMIBOLD }}>
                {t("save.hub.soon.close")}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
