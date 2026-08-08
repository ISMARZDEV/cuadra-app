import { Stack } from "expo-router";

// Stack de la vertical Supermarket: su home (index) + búsqueda, categoría, producto y lista.
export default function SupermarketLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" } }}
    />
  );
}
