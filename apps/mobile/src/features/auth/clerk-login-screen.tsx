import { AuthView } from "@clerk/expo/native";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Clerk login — AuthView renders whatever methods are enabled in the Clerk Dashboard
// (email/password, Google, Apple, passkeys), no per-provider code. On success Clerk holds the
// session; the ClerkAuthBridge feeds its token to the SDK client. Sign in with Apple must be
// enabled in the dashboard (App Store requires it alongside Google).
export function ClerkLoginScreen() {
  return (
    <SafeAreaView className="flex-1">
      <View className="gap-2 px-8 pt-12">
        <Text className="text-3xl font-bold text-primary">Cuadra</Text>
        <Text className="text-muted">Tu copiloto financiero</Text>
      </View>
      <AuthView />
    </SafeAreaView>
  );
}
