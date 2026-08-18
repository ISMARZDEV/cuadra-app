import { Tabs } from "expo-router";

import { CuadraTabBar } from "@/components/navigation/cuadra-tab-bar";
import { DevMockToggle } from "@/features/insights/components/dev-mock-toggle";

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
  return (
    <>
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
        tabBar={(props) => <CuadraTabBar {...props} />}
      >
        <Tabs.Screen name="index" options={{ title: "AISpace" }} />
        <Tabs.Screen name="news" options={{ title: "News" }} />
        <Tabs.Screen name="insights" options={{ title: "Insights" }} />
        <Tabs.Screen name="save" options={{ title: "Save" }} />
        <Tabs.Screen name="config" options={{ title: "Config" }} />
      </Tabs>
      {/* Dev-only mock-data toggle — always mounted (like Expo Go's own dev-menu bubble, visible
          app-wide, not gated to one screen), as a LATER sibling than the whole <Tabs> (screens +
          tab bar), so plain sibling paint order puts it on top of both with no zIndex/Modal tricks
          (see dev-mock-toggle.tsx for why a Modal froze the screen instead). Only meaningfully
          affects data while you're on Insights, but it's harmless to leave visible elsewhere. */}
      {__DEV__ && <DevMockToggle />}
    </>
  );
}
