import { useId, useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { useColorScheme } from "nativewind";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { KANTUMRUY_MEDIUM } from "@/theme/fonts";

// Botón-píldora de la app: icono a la izquierda, etiqueta a la derecha, canto en DEGRADADO.
// Nació del contador de mensajes gratis del chat (Figma 675:16944) y se extrajo aquí porque el
// patrón se repite: una acción secundaria que necesita más peso que un texto y menos que un botón
// sólido. El caso del chat pasa a ser UN USO de este componente, no el componente.
//
// El borde NO puede ser un `borderColor` de RN: es un degradado (`#525252 → #1C1C1C → #1C1C1C →
// #525252` en oscuro), y `borderColor` solo admite un color plano. Se dibuja con react-native-svg
// —no con `expo-linear-gradient`, cuya vista nativa no queda enlazada de forma fiable en el
// dev-build; misma razón documentada en `glass-button.tsx`.

const DEFAULT_HEIGHT = 36;
// El radio NUNCA debe superar la mitad de la altura: RN lo recorta y los extremos salen elípticos
// (le pasó a este mismo botón con el 24.586 que venía de Figma sobre una caja de 36pt).
const DEFAULT_RADIUS = 18;
const STROKE = 0.687;

type PillButtonProps = {
  /** Se renderiza tal cual a la izquierda. Va como nodo, no como nombre de icono, para que cada
   *  llamada elija su fuente: lucide, un SVG por tema, una imagen… */
  icon?: React.ReactNode;
  label: string;
  onPress?: () => void;
  /** Etiqueta accesible; si falta se usa `label`, que casi siempre es la correcta. */
  accessibilityLabel?: string;
  height?: number;
  radius?: number;
};

export function PillButton({
  icon,
  label,
  onPress,
  accessibilityLabel,
  height = DEFAULT_HEIGHT,
  radius = DEFAULT_RADIUS,
}: PillButtonProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  // Id único por instancia: dos <Svg> con el mismo id en <Defs> colisionan (mismo motivo que el
  // degradado de profundidad de `glass-button.tsx`).
  const gid = `pillEdge-${useId()}`;
  // El trazo necesita medidas reales, así que se dibuja tras el primer layout.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    setSize((prev) => (prev?.w === width && prev?.h === h ? prev : { w: width, h }));
  };

  const bg = isDark ? "rgba(21,21,21,0.20)" : "#C2FB7E";
  const textColor = isDark ? "#C2FB7E" : "#034842";
  const edge: [string, string] = isDark ? ["#525252", "#1C1C1C"] : ["#96DF3F", "#C2FB7E"];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      onLayout={onLayout}
      style={{
        height,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        borderRadius: radius,
        backgroundColor: bg,
      }}
    >
      {size ? (
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            {/* Claro en los extremos y oscuro en el centro: el canto capta la luz en los bordes. */}
            <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={edge[0]} />
              <Stop offset="0.35" stopColor={edge[1]} />
              <Stop offset="0.65" stopColor={edge[1]} />
              <Stop offset="1" stopColor={edge[0]} />
            </LinearGradient>
          </Defs>
          <Rect
            x={STROKE / 2}
            y={STROKE / 2}
            width={Math.max(0, size.w - STROKE)}
            height={Math.max(0, size.h - STROKE)}
            rx={radius}
            ry={radius}
            fill="none"
            stroke={`url(#${gid})`}
            strokeWidth={STROKE}
          />
        </Svg>
      ) : null}
      {icon ? <View>{icon}</View> : null}
      <Text style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 14, color: textColor }}>{label}</Text>
    </Pressable>
  );
}
