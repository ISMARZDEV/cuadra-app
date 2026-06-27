import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { useAuthStore } from "@/features/auth/use-auth-store";

// Minimal dev login — exchanges a seeded email for a JWT (cuadra-mobile skill §4).
// The polished react-hook-form + zod version lands in the forms phase.
export default function LoginScreen() {
  const signInDev = useAuthStore((s) => s.signInDev);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInDev(email.trim());
    } catch {
      setError("No se pudo iniciar sesión. ¿Está el backend corriendo?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 justify-center gap-6 bg-bg px-8">
      <View className="gap-2">
        <Text className="text-3xl font-bold text-primary">Cuadra</Text>
        <Text className="text-muted">Tu copiloto financiero</Text>
      </View>

      <View className="gap-3">
        <TextInput
          className="rounded-2xl border border-border bg-surface px-4 py-3 text-text"
          placeholder="tu@email.com"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        {error ? <Text className="text-danger">{error}</Text> : null}

        <Pressable
          className="items-center rounded-2xl bg-primary py-3 active:opacity-80"
          disabled={loading || email.trim().length === 0}
          onPress={onSubmit}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-base font-semibold text-white">Entrar (dev)</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
