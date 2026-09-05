import { Bell, Cog } from "lucide-react-native";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Href, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useColorScheme } from "nativewind";

import { SAVE_BG_LIGHT, SaveBackground, saveBgFor } from "../save-background";
import { useTabBarClearance } from "@/components/navigation/use-tab-bar-clearance";
import { GlassButton } from "@/components/ui/glass-button";
import { TopScrollFade } from "@/components/ui/top-scroll-fade";
import { t, useLang } from "@/i18n";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import SaveLogoDark from "../../../assets/save/save-logo-dark.svg";
import SaveLogoLight from "../../../assets/save/save-logo-light.svg";
import { useAlertsReadStore, unreadCount } from "../alerts-read";
import { useAlertNotifications } from "../api";
import type { Vertical } from "../interfaces";
import { VerticalCard } from "./components/vertical-card";
import { HUB_GAP_Y, HUB_GUTTER_X } from "./layout";
import { VERTICALS } from "./verticals";

// El hub se sale del gradiente de la app en los DOS temas: el diseño lo pide plano, y sobre él el
// card blanco con su aro blanco se recorta. Ahora el color lo pone `SaveBackground` —el mismo de
// todas las pantallas de Save— en vez de un hex propio: llegó a tener su `#F4F4F4` escrito a mano,
// idéntico al de Supermarket, que es exactamente cómo dos fondos empiezan a separarse.
//
// (La versión anterior conservaba el gradiente en oscuro «porque un gris CLARO bajo la barra de
// tabs partiría la app en dos». El argumento era del gris claro; el oscuro de Save no lo hace.)

// La hoja abre y cierra con la MISMA curva y duración con que el chat sigue al teclado de iOS
// (`chat-screen`: 250ms + `Easing.out(Easing.cubic)`). Sin resorte a propósito: un panel que rebota
// llama la atención sobre sí mismo, y esta hoja es un aviso, no un evento. Que dos superficies que
// suben desde el mismo canto se muevan distinto es lo que hace que una app se sienta cosida a mano.
const SHEET_MS = 250;
const SHEET_EASE = Easing.out(Easing.cubic);

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
  // La campana es lo ÚNICO del hub que mira datos; el resto sigue siendo navegación pura. El punto
  // rojo tiene que ser VERDADERO: uno pintado siempre entrena al usuario a ignorarlo, y a la
  // tercera vez que abre y no hay nada, la campana deja de significar algo.
  const notifications = useAlertNotifications();
  const readIds = useAlertsReadStore((s) => s.readIds);
  const hydrateRead = useAlertsReadStore((s) => s.hydrate);
  useEffect(() => {
    void hydrateRead();
  }, [hydrateRead]);
  const unread = unreadCount(
    (notifications.data ?? []).map((n) => n.id),
    readIds,
  );

  const [pending, setPending] = useState<Vertical | null>(null);
  // El `Modal` se monta y desmonta APARTE del contenido, y por eso son dos estados y no uno: al
  // cerrar, `pending` se va enseguida —lo que dispara el `exiting` del panel y del velo— pero el
  // Modal tiene que seguir montado hasta que esa salida termine. Con un solo estado, el Modal se
  // llevaría por delante a sus hijos en el primer frame y no se vería salida ninguna.
  const [sheetMounted, setSheetMounted] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = (vertical: Vertical) => {
    // Una vertical sin datos NO navega: mandarla a una pantalla vacía es prometer algo que no
    // existe. Abre su promesa concreta — qué va a poder preguntar el día que llegue.
    if (vertical.status === "live" && vertical.href) {
      router.push(vertical.href);
      return;
    }
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setPending(vertical);
    setSheetMounted(true);
  };

  const closeSheet = () => {
    setPending(null);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setSheetMounted(false), SHEET_MS);
  };

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  return (
    <View className="flex-1">
      {isDark ? (
        <SaveBackground />
      ) : (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: SAVE_BG_LIGHT }]}
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
              Save. El punto rojo cuenta lo que no has MIRADO (ver `alerts-read`), y la cuenta va
              también en la etiqueta: un punto de color no existe para un lector de pantalla. */}
          <View className="absolute right-0">
            <GlassButton
              icon={Bell}
              label={
                unread > 0
                  ? `${t("save.alerts.title")}, ${t("save.alerts.unread", { count: String(unread) })}`
                  : t("save.alerts.title")
              }
              size={48}
              iconSize={HEADER_ICON}
              badge={unread > 0}
              onPress={() => router.push("/save/alerts" as Href)}
            />
          </View>
        </View>

        <View style={{ gap: HUB_GAP_Y }}>
          {VERTICALS.map((vertical) => (
            <VerticalCard key={vertical.id} vertical={vertical} onPress={open} />
          ))}
        </View>

      </ScrollView>

      {/* Estado «en construcción»: dice QUÉ va a responder esa vertical. Un «próximamente» vacío no
          le sirve a nadie; esto convierte una ausencia en una promesa concreta.
          Vive en un `Modal` y NO dentro del `ScrollView`. Antes se renderizaba inline detrás de los
          cuatro cards: tocar una vertical de abajo abría la hoja a ~300pt del pliegue, o sea fuera
          de pantalla — el toque no respondía nada. Misma pieza que `InfoTooltip`, por la misma
          razón: lo que tiene que FLOTAR no puede viajar con el contenido que lo abrió. */}
      {/* `animationType="none"`: la entrada y la salida las animan el velo y el panel, igual que
          `InfoTooltip`. No es capricho — con `"fade"`/`"slide"` el modal de react-native-web sólo se
          desmonta cuando TERMINA su animación de salida, y en jsdom esa animación no corre nunca:
          el contenido queda montado para siempre y ningún test puede afirmar que la hoja se cerró.
          Animándolo por dentro, además, el velo se FUNDE mientras el panel DESLIZA: con el
          `"slide"` nativo el velo oscuro subiría junto con el panel, que se lee como una mancha
          negra trepando desde el canto. */}
      <Modal transparent visible={sheetMounted} animationType="none" onRequestClose={closeSheet}>
        {/* El velo es tocable y cierra: es la salida que un usuario prueba ANTES de buscar el
            botón. Lleva etiqueta accesible porque no tiene texto que lo nombre, pero NO
            `accessibilityRole="button"`: anidar un botón —«Entendido»— dentro de otro es HTML
            inválido, y para un lector de pantalla un botón a pantalla completa es ruido. La salida
            que se anuncia es la explícita. */}
        {pending ? (
          <Animated.View
            entering={FadeIn.duration(SHEET_MS).easing(SHEET_EASE)}
            exiting={FadeOut.duration(SHEET_MS).easing(SHEET_EASE)}
            style={StyleSheet.absoluteFill}
          >
            <Pressable
              accessibilityLabel={t("save.hub.soon.dismiss")}
              onPress={closeSheet}
              style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}
            >
              {/* Anclada ABAJO, al alcance del pulgar: la abre un toque en un card que puede estar
                  al pie de la lista, así que centrarla mandaría la vista al otro extremo de la
                  pantalla. Sube deslizando desde el canto — de donde viene es de donde entra.
                  Es `Pressable` y no `View` para TRAGARSE el toque — sobre una vista pelada, tocar
                  el panel caería en el velo de atrás y lo cerraría en la cara del usuario. */}
              <Animated.View
                entering={SlideInDown.duration(SHEET_MS).easing(SHEET_EASE)}
                exiting={SlideOutDown.duration(SHEET_MS).easing(SHEET_EASE)}
              >
                <Pressable
                  onPress={() => {}}
                  // `bg-surface`, NO `bg-card`: ese token NO EXISTE en `tailwind.config.js` y venía
                  // heredado del panel inline anterior, donde la falta no se veía —se apoyaba
                  // directamente sobre el fondo de la pantalla—. Sobre el velo sí se ve: el texto
                  // quedaba flotando encima de los cards.
                  className="rounded-t-3xl bg-surface px-5 pt-5"
                  style={{
                    borderCurve: "continuous",
                    paddingBottom: Math.max(insets.bottom, 20),
                  }}
                >
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
                    onPress={closeSheet}
                    className="mt-4 self-start rounded-full bg-primary/15 px-4 py-2"
                  >
                    <Text
                      className="text-sm text-primary"
                      style={{ fontFamily: KANTUMRUY_SEMIBOLD }}
                    >
                      {t("save.hub.soon.close")}
                    </Text>
                  </Pressable>
                </Pressable>
              </Animated.View>
            </Pressable>
          </Animated.View>
        ) : null}
      </Modal>

      {/* La banda de desvanecido va POR DELANTE del scroll y es lo ÚNICO fijo de la pantalla: todo
          —cards y header— se difumina al subir en vez de cortarse a ras del borde. Misma pieza que
          el chat (`TopScrollFade`), con el color de ESTE fondo: con el del chat se vería una nube
          blanca sobre el gris. */}
      {/* El lavado es el fondo REAL, ahora también en oscuro: antes pasaba `undefined` porque bajo
          el gradiente no existía «el color del fondo» y el componente tenía que apañarse. Con el
          fondo plano de Save sí existe, así que se le dice. */}
      <TopScrollFade height={fadeHeight} isDark={isDark} color={saveBgFor(isDark)} />
    </View>
  );
}
