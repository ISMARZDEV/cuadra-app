import { Stack } from "expo-router";

// Root layout — orquesta (auth) y (tabs). Sin lógica aún.
export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
    </Stack>
  );
}
