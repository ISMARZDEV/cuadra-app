import { Construction } from "lucide-react-native";
import { Text, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { palette } from "@/theme";

// Stub reutilizable para las pantallas del esqueleto (sin lógica).
// Estiliza con NativeWind (className) + tokens del design-system (dark/light auto).
export function Placeholder({ title }: { title: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-3">
      <Icon as={Construction} size={48} color={palette.primary} />
      <Text className="text-2xl font-bold text-primary">{title}</Text>
      <Text className="text-muted">Esqueleto · sin lógica aún</Text>
    </View>
  );
}
