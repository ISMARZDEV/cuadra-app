import "../global.css";
import "@/lib/api/client"; // side-effect: configure the SDK client (baseURL + Bearer)

import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import { useAuthStore } from "@/features/auth/use-auth-store";
import { queryClient } from "@/lib/api/query-client";
import { ThemeProvider } from "@/lib/theme/theme-provider";
import { palette } from "@/theme";

// Root layout — gates (auth) vs (tabs) on session presence (cuadra-mobile skill §4).
export default function RootLayout() {
  const status = useAuthStore((s) => s.status);
  const restore = useAuthStore((s) => s.restore);

  useEffect(() => {
    restore();
  }, [restore]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {status === "loading" ? (
          <View className="flex-1 items-center justify-center bg-bg">
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : (
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Protected guard={status === "authenticated"}>
              <Stack.Screen name="(tabs)" />
            </Stack.Protected>
            <Stack.Protected guard={status === "unauthenticated"}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
          </Stack>
        )}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
