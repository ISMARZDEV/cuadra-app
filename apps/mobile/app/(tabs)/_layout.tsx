import { Tabs } from "expo-router";

import { CuadraTabBar } from "@/components/navigation/cuadra-tab-bar";

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
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "transparent" } }}
      tabBar={(props) => <CuadraTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: "AISpace" }} />
      <Tabs.Screen name="news" options={{ title: "News" }} />
      <Tabs.Screen name="insights" options={{ title: "Insights" }} />
      <Tabs.Screen name="save" options={{ title: "Save" }} />
      <Tabs.Screen name="config" options={{ title: "Config" }} />
    </Tabs>
  );
}
