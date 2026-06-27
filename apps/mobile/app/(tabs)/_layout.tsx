import { Tabs } from "expo-router";

import { CuadraTabBar } from "@/components/navigation/cuadra-tab-bar";

// Tab bar — News · Insights · [iM logo · AISpace] · Save · Config.
// Custom pill-with-notch bar (cuadra-design-system §3 tab bar); routes stay declarative.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "transparent" } }}
      tabBar={(props) => <CuadraTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: "News" }} />
      <Tabs.Screen name="insights" options={{ title: "Insights" }} />
      <Tabs.Screen name="aispace" options={{ title: "AISpace" }} />
      <Tabs.Screen name="save" options={{ title: "Save" }} />
      <Tabs.Screen name="config" options={{ title: "Config" }} />
    </Tabs>
  );
}
