import { Tabs } from "expo-router";
import { useRef } from "react";
import { type GestureResponderEvent, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";

import { AppBackground } from "@/components/ui/app-background";
import { CuadraTabBar } from "@/components/navigation/cuadra-tab-bar";
import { isRevealTap } from "@/components/navigation/reveal-tap";
import { DevMockToggle } from "@/features/insights/components/dev-mock-toggle";
import { OrbLiquidFocus } from "@/components/ui/liquid-focus/orb-liquid-focus";
import { useNavHideStore } from "@/store/nav-hide-store";

// Tab bar — News · Insights · [iM logo · AISpace] · Save · Config.
// Custom pill-with-notch bar (cuadra-design-system §3 tab bar); routes stay declarative.
//
// AISpace (chat) is home — app launch always lands here, not News. `initialRouteName` on `<Tabs>`
// does NOT control this (Expo Router resolves a bare "/(tabs)" URL to whichever file is `index.tsx`
// BEFORE the navigator's own initialRouteName is ever consulted — confirmed via a runtime warning
// when we tried routing the root Stack at "(tabs)/aispace" directly instead). The only reliable
// fix is making the chat screen the literal `index.tsx` file — so News lives at `news.tsx` now, chat
// at `index.tsx`. The custom tab bar filters routes by NAME into fixed visual slots (unaffected by
// which file is "index"), but its OWN name lookups needed updating too — see cuadra-tab-bar.tsx.
export default function TabsLayout() {
  const tap = useNavHideStore((s) => s.tap);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  // Lo que la lente FOTOGRAFÍA. Envuelve sólo a <Tabs>: así ni la propia lente ni el botón de
  // mocks acaban dentro de su propia imagen. `collapsable={false}` es obligatorio o Android puede
  // fundir la vista con su padre y dejar la ref sin nodo que capturar.
  const backdropRef = useRef<View>(null);
  // Un único valor físico compartido entre el hitbox de la barra y la lente que vive encima.
  // Guardarlo aquí evita estado React por cada muestra del dedo y evita un segundo recognizer.
  const touchPressure = useSharedValue(0);

  const onTouchStart = (e: GestureResponderEvent) => {
    touchStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
  };
  const onTouchEnd = (e: GestureResponderEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    // Sólo un TOQUE revela la barra. Un arrastre es el gesto que la esconde: revelarla a mitad
    // haría que apareciera y desapareciera dentro del mismo movimiento.
    if (isRevealTap({ dx: e.nativeEvent.pageX - start.x, dy: e.nativeEvent.pageY - start.y })) {
      tap();
    }
  };

  return (
    // El detector va en el LAYOUT, no dentro de la barra: una barra escondida está fuera de la
    // pantalla y no puede escuchar toques. `onTouchStart`/`onTouchEnd` burbujean desde cualquier
    // hijo SIN reclamar el gesto, así que observan sin robárselo a nadie.
    <View style={{ flex: 1 }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <View ref={backdropRef} collapsable={false} style={{ flex: 1 }}>
        {/* ⭐⭐ EL FONDO VA DENTRO DE LO QUE SE FOTOGRAFÍA, y esto no es decorativo.
            La lente dibuja la foto ENCIMA del contenido vivo. Si la foto trae canal alfa, las dos
            capas se COMPONEN y se ve todo duplicado —el patrón lo llama «ghost»—, y además la
            aberración cromática muestrea a través del borde alfa y traza un contorno de colores
            alrededor de todo.
            El degradado de la app se monta en `theme-provider`, FUERA de este árbol, así que aquí
            sólo había transparencia. Con una copia propia dentro, la captura sale OPACA y los dos
            defectos desaparecen de raíz. Visualmente no cambia nada: tapa al de fuera, que es
            idéntico. */}
        <AppBackground />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: "transparent" },
          // ⚠️ CONGELAR LA PESTAÑA QUE NO SE ESTÁ MIRANDO.
          //
          // Las cinco pantallas quedan MONTADAS a la vez —así funcionan las tabs—, y montado no es
          // gratis: el chat tiene relojes de Skia (`orb-sphere`, `shimmer-text`,
          // `suggestion-skeleton`) que laten EN CADA FOTOGRAMA mientras estén montados, y consultas
          // con `refetchInterval`. O sea que estando en Ahorra seguías pagando el chat entero.
          //
          // Eso explica el síntoma exacto que se midió: el hilo de UI aguanta (49-60 fps) y el de
          // JS se hunde (40 → 21) cuanto más se usa la app. No es sólo memoria — es trabajo por
          // fotograma que se ACUMULA con cada pantalla visitada.
          //
          // `freezeOnBlur` deja de renderizar la pantalla que perdió el foco (react-native-screens).
          // No la desmonta: al volver está donde estaba, sin recargar.
          freezeOnBlur: true,
        }}
        tabBar={(props) => <CuadraTabBar {...props} touchPressure={touchPressure} />}
      >
        <Tabs.Screen name="index" options={{ title: "AISpace" }} />
        <Tabs.Screen name="news" options={{ title: "News" }} />
        <Tabs.Screen name="insights" options={{ title: "Insights" }} />
        <Tabs.Screen name="save" options={{ title: "Save" }} />
        <Tabs.Screen name="config" options={{ title: "Config" }} />
      </Tabs>
      </View>
      {/* La lente líquida del orbe: hermano POSTERIOR a <Tabs>, así que cubre las pantallas y la
          barra. Su foreground vuelve a dibujar sólo el orbe nítido; `pointerEvents="none"` deja
          que el responder original conserve el gesto debajo. */}
      <OrbLiquidFocus backdropRef={backdropRef} touchPressure={touchPressure} />

      {/* Dev-only mock-data toggle — always mounted (like Expo Go's own dev-menu bubble, visible
          app-wide, not gated to one screen), as a LATER sibling than the whole <Tabs> (screens +
          tab bar), so plain sibling paint order puts it on top of both with no zIndex/Modal tricks
          (see dev-mock-toggle.tsx for why a Modal froze the screen instead). Only meaningfully
          affects data while you're on Insights, but it's harmless to leave visible elsewhere. */}
      {__DEV__ && <DevMockToggle />}
    </View>
  );
}
