import "../global.css";
import "@/lib/api/client"; // side-effect: configure the SDK client (baseURL + Bearer)

import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import { useAuthStore } from "@/features/auth/use-auth-store";
import { useLanguageStore } from "@/features/settings/use-language-store";
import { queryClient } from "@/lib/api/query-client";
import { sounds } from "@/lib/sounds";
import { ThemeProvider } from "@/lib/theme/theme-provider";
import { DrawerProvider } from "@/store/drawer-store";
import { palette } from "@/theme";

// Root layout — gates (auth) vs (tabs) on session presence (cuadra-mobile skill §4).
export default function RootLayout() {
  const status = useAuthStore((s) => s.status);
  const restore = useAuthStore((s) => s.restore);
  const restoreLanguage = useLanguageStore((s) => s.restore);

  useEffect(() => {
    restore();
    restoreLanguage(); // apply the persisted language choice (or follow the device when auto)
  }, [restore, restoreLanguage]);

  useEffect(() => {
    sounds.startup(); // app-launch sound (once per app open)
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {status === "loading" ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : (
          // contentStyle transparent → the root AppBackground gradient shows through every screen.
          // DrawerProvider holds the AISpace sessions-drawer progress (chat screen + tab bar share it).
          <DrawerProvider>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" } }}>
              <Stack.Protected guard={status === "authenticated"}>
                <Stack.Screen name="(tabs)" />
              </Stack.Protected>
              <Stack.Protected guard={status === "unauthenticated"}>
                <Stack.Screen name="(auth)" />
              </Stack.Protected>
            </Stack>
          </DrawerProvider>
        )}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
