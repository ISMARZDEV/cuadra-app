import { Stack } from "expo-router";

// Save es un stack anidado, igual que Config: el hub (index) + las verticales empujadas encima.
// La tab bar sigue visible (pertenece a (tabs)), así que tocar la tab Save vuelve al hub.
//
// Por qué directorio y no un archivo suelto: `supermarket` es UNA de las verticales. Cuando entre
// `cards`, su stack se cuelga al lado sin tocar nada de esto. Con rutas planas
// (`save-supermarket-product.tsx`) habría que renombrar todo el día que aparezca la segunda.
export default function SaveLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" } }}
    />
  );
}
