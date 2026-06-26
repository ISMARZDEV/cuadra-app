import { Tabs } from "expo-router";

// Tab bar — News · Insights · AISpace · Save · Config (chat AISpace al centro · §3.1).
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: "#16A34A" }}>
      <Tabs.Screen name="index" options={{ title: "News" }} />
      <Tabs.Screen name="insights" options={{ title: "Insights" }} />
      <Tabs.Screen name="aispace" options={{ title: "AISpace" }} />
      <Tabs.Screen name="save" options={{ title: "Save" }} />
      <Tabs.Screen name="config" options={{ title: "Config" }} />
    </Tabs>
  );
}
