import "../global.css";
import "@/lib/api/client"; // side-effect: configure the SDK client (baseURL + Bearer)

import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Akshar_500Medium, Akshar_600SemiBold } from "@expo-google-fonts/akshar";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import { CLERK_ENABLED, CLERK_PUBLISHABLE_KEY } from "@/features/auth/clerk";
import { ClerkAuthBridge } from "@/features/auth/clerk-auth-bridge";
import { useAuthStore } from "@/features/auth/use-auth-store";
import { useSession } from "@/features/auth/use-session";
import { useLanguageStore } from "@/features/settings/use-language-store";
import { queryClient } from "@/lib/api/query-client";
import { startLocalAlertNotifications } from "@/lib/notifications/local-alerts";
import { sounds } from "@/lib/sounds";
import { ThemeProvider } from "@/lib/theme/theme-provider";
import { DrawerProvider } from "@/store/drawer-store";
import { palette } from "@/theme";

// Root layout — dual-mode auth (cuadra-mobile skill §4). In Clerk mode wraps the app in
// <ClerkProvider> (+ the bridge that feeds Clerk's token to the SDK client); in dev mode the
// dev-login store drives it. Gating lives in <AppGate> so it can read useSession() (which reads
// Clerk's useAuth) from UNDER the provider.
export default function RootLayout() {
  const app = <AppGate />;
  if (!CLERK_ENABLED) return app;
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <ClerkAuthBridge />
      {app}
    </ClerkProvider>
  );
}

function AppGate() {
  const status = useSession();
  const restore = useAuthStore((s) => s.restore);
  const restoreLanguage = useLanguageStore((s) => s.restore);
  const languageRestored = useLanguageStore((s) => s.restored);
  // Akshar — the money-figure font (Insights wheel/tiles, Figma "Akshar:Medium"/"Akshar:Semibold").
  const [fontsLoaded] = useFonts({ Akshar_500Medium, Akshar_600SemiBold });

  useEffect(() => {
    // dev-login: restore the persisted JWT. In Clerk mode, Clerk restores its own session (tokenCache).
    if (!CLERK_ENABLED) restore();
    restoreLanguage(); // apply the persisted language choice (or follow the device when auto)
  }, [restore, restoreLanguage]);

  useEffect(() => {
    sounds.startup(); // app-launch sound (once per app open)
  }, []);

  // Al autenticarse, arranca las alertas locales G4 (funciona con firma gratis; buzz al abrir/volver
  // a la app). El push remoto 24/7 (register-push.ts) queda para cuando haya cuenta Apple de pago.
  useEffect(() => {
    if (status === "authenticated") void startLocalAlertNotifications();
  }, [status]);

  // Wait for the language restore too, not just auth — otherwise the home screen (chat, mounted
  // immediately on launch) renders once with whatever deviceLanguage() resolved to at JS
  // module-init time, and only self-corrects on a LATER change (relies on src/i18n's useLang()
  // reactivity firing again, which isn't guaranteed to happen soon, or at all, in one session).
  // Also wait for Akshar so money figures never flash in the system font first.
  const ready = status !== "loading" && languageRestored && fontsLoaded;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {!ready ? (
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
