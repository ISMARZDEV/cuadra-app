import { Stack } from "expo-router";

// Config tab is a nested stack: the list (index) + pushed sub-screens (personality…). The tab bar
// stays visible (it belongs to (tabs)), so a sub-screen is reachable back via its own arrow OR by
// tapping the Config tab (which pops the stack to index). Headers off — screens draw their own.
export default function ConfigLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" } }}
    />
  );
}
