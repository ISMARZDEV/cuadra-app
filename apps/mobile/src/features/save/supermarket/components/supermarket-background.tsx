import { View } from "react-native";
import { useColorScheme } from "nativewind";

import { AppBackground } from "@/components/ui/app-background";

/**
 * El fondo de las pantallas de Supermarket: gris muy claro en tema claro, el degradado de la app en
 * oscuro.
 *
 * ⭐ Compartido desde su TERCER consumidor —inicio, rejilla y detalle— y no por ahorrar líneas: el
 * gris estaba escrito a mano en dos sitios, y un fondo que difiere entre dos pantallas de la misma
 * vertical se nota justo al navegar de una a otra, que es cuando el usuario las ve seguidas.
 *
 * ⚠️ En claro NO es blanco puro. Las tarjetas de producto SÍ lo son, y ese contraste mínimo es lo
 * que las hace leerse como piezas apoyadas sobre una superficie en vez de como recortes del fondo.
 * Poner blanco aquí las borra.
 *
 * El color se EXPORTA además del componente porque la rejilla lo necesita suelto: pinta con él la
 * banda del buscador y el degradado que la disuelve, y esos tres tienen que ser el mismo gris o se
 * ve el canto.
 */
export const BG_LIGHT = "#F4F4F4";

export function SupermarketBackground() {
  const { colorScheme } = useColorScheme();

  if (colorScheme === "dark") return <AppBackground />;
  return (
    <View pointerEvents="none" className="absolute inset-0" style={{ backgroundColor: BG_LIGHT }} />
  );
}
