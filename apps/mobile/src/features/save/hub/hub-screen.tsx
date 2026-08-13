import { Bell, Cog } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { useColorScheme } from "nativewind";

import { AppBackground } from "@/components/ui/app-background";
import { useTabBarClearance } from "@/components/navigation/use-tab-bar-clearance";
import { GlassButton } from "@/components/ui/glass-button";
import { TopScrollFade } from "@/components/ui/top-scroll-fade";
import { t, useLang } from "@/i18n";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import SaveLogoDark from "../../../assets/save/save-logo-dark.svg";
import SaveLogoLight from "../../../assets/save/save-logo-light.svg";
import type { Vertical } from "../interfaces";
import { VerticalCard } from "./components/vertical-card";
import { VERTICALS } from "./verticals";

// El hub se sale del gradiente de la app en tema CLARO: el diseño lo pide gris plano, y sobre él
// el card blanco con su aro blanco se recorta. En oscuro se queda con `AppBackground`, porque un
// gris claro debajo de la barra de tabs oscura partiría la app en dos.
const HUB_BG_LIGHT = "#F4F4F4";

// Figma da 19 para AMBOS (márgenes laterales y paso vertical de 172 sobre un card de 153). El aire
// vertical se respeta; el lateral se apretó a pedido, para que el card gane ancho — y ese ancho va
// entero al blanco del título, que es el lado que se queda corto (el panel de arte es fijo).
const HUB_GUTTER_X = 14;
const HUB_GAP_Y = 19;

// El logo va a su TAMAÑO NATURAL (134×67, el del SVG). Medido sobre el mockup da lo mismo, así que
// no hay nada que escalar — y escalar un logotipo «para que entre» es cómo se deforma una marca.
const LOGO_W = 134;
const LOGO_H = 67;

// El glifo dentro del botón de vidrio. Por encima del default de `GlassButton` (22) y del 20 que
// usa el chat: acá el header no tiene texto que lo acompañe —el logo es el centro— así que los dos
// símbolos de los costados cargan solos con el peso y a 22 se veían chicos dentro del círculo de 48.
const HEADER_ICON = 26;

// Cuánto BAJA la banda de desvanecido por debajo del área segura. La banda entera mide
// `insets.top + esto`: cubre la franja de la barra de estado —donde antes el contenido se cortaba a
// filo— más este tramo de transición.
//
// El contenido reserva ARRIBA exactamente el alto de la banda, ni uno menos: el header viaja con el
// scroll, y si arrancara dentro de la banda se vería lavado EN REPOSO, que es justo lo que no
// queremos. Empieza donde la banda ya es transparente del todo.
const FADE_TAIL = 16;

// El hub de Save: los pilares del comparador. NO trae datos — es navegación pura, y por eso no
// depende de ningún endpoint.
//
// FASE 1 (esqueleto): la lista funciona y respeta el contrato `live`/`soon`. El card con la
// ilustración, la estrella y la guirnalda del diseño llega en la Fase 2.
export function HubScreen() {
  useLang(); // re-render en vivo al cambiar idioma
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const tabBarClearance = useTabBarClearance();
  // El inset se toma A MANO en vez de con `SafeAreaView`: la banda de desvanecido tiene que cubrir
  // la franja de la barra de estado, y con el padding del SafeAreaView el contenido nunca llega
  // hasta ahí — se cortaba a filo justo en ese borde, que es el defecto que esto arregla.
  const insets = useSafeAreaInsets();
  const fadeHeight = insets.top + FADE_TAIL;
  // El logotipo tiene dos versiones dibujadas, no una recoloreada: la palabra cambia de color pero
  // el símbolo del medio no. Por eso se elige el ASSET, no un `fill`.
  const SaveLogo = isDark ? SaveLogoDark : SaveLogoLight;
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
    <View className="flex-1">
      {isDark ? (
        <AppBackground />
      ) : (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: HUB_BG_LIGHT }]}
        />
      )}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: HUB_GUTTER_X,
          // Justo el alto de la banda: el header arranca donde el desvanecido ya no tiñe.
          paddingTop: fadeHeight,
          // La barra de tabs FLOTA sobre el contenido: sin este blanco, el cuarto card se lee
          // cortado por la mitad (verificado en simulador).
          paddingBottom: tabBarClearance + HUB_GAP_Y,
        }}
      >
        {/* El header VIAJA CON EL SCROLL, no flota: sube junto con los cards y se difumina en la
            banda de arriba, en vez de quedarse clavado tapándolos.

            El logotipo reemplaza al título de texto. Va CENTRADO en absoluto y los botones anclados
            a los costados: con un `justify-between` el logo se descentraría en cuanto un lado
            cambie de ancho.

            Como el logo ya no es texto, el nombre de la pantalla se lo lleva la etiqueta accesible
            — si no, un lector de pantalla llega a Ahorra y no sabe dónde está. */}
        <View className="mb-4 justify-center" style={{ height: LOGO_H }}>
          <View
            accessibilityRole="header"
            accessibilityLabel={t("save.hub.title")}
            style={{ alignSelf: "center" }}
          >
            <SaveLogo width={LOGO_W} height={LOGO_H} />
          </View>

          {/* Los dos botones son los MISMOS que los de arriba del chat: `GlassButton` a 48, sin
              variante propia. Un botón de vidrio distinto por pantalla es cómo una app termina con
              tres lenguajes de botón; además el plan §6.1 ya pedía este componente para el header.

              ⚠️ El de configuración todavía NO HACE NADA — decisión explícita del usuario. Queda
              sin `onPress` a propósito: prometer una acción que no llega es peor que no tenerla. */}
          <View className="absolute left-0">
            <GlassButton icon={Cog} label={t("config.title")} size={48} iconSize={HEADER_ICON} />
          </View>

          {/* La campana es el ÚNICO acceso al feed de alertas desde que dejó de ser la pantalla de
              Save. Le falta todavía el punto rojo del diseño. */}
          <View className="absolute right-0">
            <GlassButton
              icon={Bell}
              label={t("save.alerts.title")}
              size={48}
              iconSize={HEADER_ICON}
              onPress={() => router.push("/save/alerts" as Href)}
            />
          </View>
        </View>

        <View style={{ gap: HUB_GAP_Y }}>
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

      {/* La banda de desvanecido va POR DELANTE del scroll y es lo ÚNICO fijo de la pantalla: todo
          —cards y header— se difumina al subir en vez de cortarse a ras del borde. Misma pieza que
          el chat (`TopScrollFade`), con el color de ESTE fondo: con el del chat se vería una nube
          blanca sobre el gris. */}
      <TopScrollFade
        height={fadeHeight}
        isDark={isDark}
        color={isDark ? undefined : HUB_BG_LIGHT}
      />
    </View>
  );
}
