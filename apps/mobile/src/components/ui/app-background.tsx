import { useColorScheme } from "nativewind";
import { StyleSheet, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { theme } from "@/theme";

/**
 * El color del fondo de la app a una FRACCIÓN de su alto (0 = arriba, 1 = abajo).
 *
 * El fondo es un DEGRADADO, así que «el color del fondo» no existe: existe el color del fondo A UNA
 * ALTURA. Cualquier superficie opaca que quiera CONFUNDIRSE con él —una banda detrás de un buscador
 * fijo, por ejemplo— tiene que preguntárselo aquí en vez de inventarse una constante.
 *
 * Nace de un defecto medido: la banda del buscador de «Categorías» llevaba un `#0B0B0B` puesto a
 * ojo, y el fondo en esa altura vale `#010606`. No sólo era más CLARA (11 contra 6 de luminancia):
 * era gris NEUTRO donde el fondo tira a teal. Matiz y valor equivocados, y se leía como un parche.
 *
 * Vive junto al degradado y no en la pantalla a propósito: quien cambie `bgGradient` no puede saber
 * qué pantallas se pintaron encima a mano, pero sí arrastra a todo el que pregunte.
 */
export function appBgColorAt(scheme: "light" | "dark", fraction: number): string {
  const [from, to] = theme[scheme].bgGradient;
  // Fuera de rango se queda en los topes: una banda que se desplaza al plegarse llega a pedir una
  // fracción negativa, y un color roto ahí pintaría un agujero en mitad de la pantalla.
  const k = Math.min(1, Math.max(0, fraction));
  const channel = (offset: number) => {
    const a = parseInt(from.slice(offset, offset + 2), 16);
    const b = parseInt(to.slice(offset, offset + 2), 16);
    return Math.round(a + (b - a) * k)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

// Full-bleed vertical gradient behind the whole app (top → bottom). Theme-aware: deep teal→black on
// dark, white→soft-green on light. Drawn with react-native-svg (already in the native build — no
// expo-linear-gradient / rebuild). Rendered once at the root; screens/navigator stay transparent.
export function AppBackground() {
  const { colorScheme } = useColorScheme();
  const { width, height } = useWindowDimensions();
  const [from, to] = theme[colorScheme === "dark" ? "dark" : "light"].bgGradient;

  return (
    <Svg
      pointerEvents="none"
      width={width}
      height={height}
      style={StyleSheet.absoluteFill}
    >
      <Defs>
        <LinearGradient id="appBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#appBg)" />
    </Svg>
  );
}
