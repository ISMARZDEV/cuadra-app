import { View } from "react-native";
import { useColorScheme } from "nativewind";

/**
 * El fondo de TODAS las pantallas de Save: hub, alertas, inicio de Supermarket, categorías y detalle.
 *
 * ⭐ **Plano en los dos temas, y esa es la decisión.** El resto de la app va sobre `AppBackground`,
 * un degradado vertical (teal profundo → negro en oscuro). Save se sale de él: sus pantallas son
 * rejillas de tarjetas, y un degradado detrás de una cuadrícula hace que la misma tarjeta se vea de
 * un color arriba y de otro abajo. Un fondo plano deja que las tarjetas sean lo único que cambia.
 *
 * ⭐ **Y mata una familia entera de defectos: `appBgColorAt`.** Con un degradado, «el color del
 * fondo» no existe —existe el color A UNA ALTURA— así que cada superficie opaca que quisiera
 * confundirse con él (la banda del buscador, el desvanecido del canto superior, la hoja de
 * búsqueda) tenía que muestrear el gradiente a su posición exacta y volver a hacerlo al plegarse.
 * Con un color plano esas cuentas no es que estén mal: es que sobran.
 *
 * ⚠️ En claro NO es blanco puro. Las tarjetas de producto SÍ lo son, y ese contraste mínimo es lo
 * que las hace leerse como piezas apoyadas sobre una superficie en vez de como recortes del fondo.
 * Poner blanco aquí las borra.
 *
 * Los colores se EXPORTAN además del componente porque hay superficies que necesitan el hex suelto:
 * el desvanecido que disuelve una banda, o una hoja que tiene que aterrizar del mismo color que la
 * pantalla de la que sale.
 */
export const SAVE_BG_LIGHT = "#F4F4F4";
export const SAVE_BG_DARK = "#151515";

/** El color del fondo de Save para un tema. Para quien necesita el hex, no el componente. */
export function saveBgFor(isDark: boolean): string {
  return isDark ? SAVE_BG_DARK : SAVE_BG_LIGHT;
}

export function SaveBackground() {
  const { colorScheme } = useColorScheme();

  return (
    <View
      pointerEvents="none"
      className="absolute inset-0"
      style={{ backgroundColor: saveBgFor(colorScheme === "dark") }}
    />
  );
}
