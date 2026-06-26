import { Text, View } from "react-native";

import { colors } from "@/theme";

// Stub reutilizable para las pantallas del esqueleto (sin lógica).
export function Placeholder({ title }: { title: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.bg }}>
      <Text style={{ fontSize: 24, fontWeight: "700", color: colors.primary }}>{title}</Text>
      <Text style={{ color: colors.muted }}>Esqueleto · sin lógica aún</Text>
    </View>
  );
}
