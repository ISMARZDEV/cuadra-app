import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NAVBAR_VIEWBOX } from "./notched-glass";

// Constantes de la barra (`cuadra-tab-bar.tsx`): ancho tope y el aire que se deja bajo ella.
const BAR_SIDE_MARGIN = 24;
const BAR_MAX_WIDTH = 380;
const BAR_BOTTOM_AIR = 14;

/**
 * Cuánto blanco tiene que reservar una pantalla al PIE para que su último elemento no quede debajo
 * de la barra de tabs. La barra FLOTA sobre el contenido (`position: absolute`, `bottom: 0`), así
 * que ninguna pantalla la descuenta sola: sin esto la última fila se lee cortada — le pasaba al
 * cuarto card del hub de Save.
 *
 * Vive en su PROPIO módulo, no dentro de `cuadra-tab-bar.tsx`: importarlo desde ahí arrastra la
 * barra entera al grafo de quien lo use, y con ella los `require` de PNG que el harness de tests
 * no resuelve. Un hook que sólo necesita geometría no debe traerse una pantalla de vidrio detrás.
 */
export function useTabBarClearance() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const barWidth = Math.min(width - BAR_SIDE_MARGIN, BAR_MAX_WIDTH);
  const navHeight = NAVBAR_VIEWBOX.height * (barWidth / NAVBAR_VIEWBOX.width);

  return navHeight + Math.max((insets.bottom || 12) - 16, 6) + BAR_BOTTOM_AIR;
}
