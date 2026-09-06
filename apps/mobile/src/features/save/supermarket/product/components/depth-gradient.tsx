import { memo, useId } from "react";
import { StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

/**
 * EL BRILLO DEL CANTO de un disco tintado. Nació en `glass-button.tsx` y vive aquí desde que lo
 * usan DOS piezas del detalle —la fila de acciones y la fila de categoría—: a la segunda copia se
 * extrae, o los dos discos se separan al primer retoque de uno solo.
 *
 * ⭐ **De abajo a arriba**: el borde denso va en el CANTO INFERIOR, así el disco se lee como una
 * superficie curvada que recoge el rebote de la luz por debajo. Al revés —denso arriba— se lee como
 * una tapa iluminada de frente y con los tintes claros de las cartas ensucia la parte alta.
 *
 * Se dibuja ya REDONDO para que el disco no necesite `overflow: hidden`, que bajo un `scale` no
 * sigue a la transformación y deja asomar las esquinas cuadradas.
 */
export const DepthGradient = memo(function DepthGradient({
  color,
  size,
}: {
  color: string;
  size: number;
}) {
  // Un id por instancia: varios `<Defs>` con el mismo id en el mismo árbol y todas las piezas cogen
  // el primero que encuentren.
  const gid = `depthGrad-${useId()}`;
  return (
    <Svg style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
      <Defs>
        <LinearGradient id={gid} x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor={color} stopOpacity="0.55" />
          <Stop offset="0.5" stopColor={color} stopOpacity="0.18" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={size} height={size} rx={size / 2} ry={size / 2} fill={`url(#${gid})`} />
    </Svg>
  );
});

/**
 * Un paso hacia el blanco. El brillo SIEMPRE aclara el relleno: pasarle el tinte tal cual pintaría
 * una sombra donde va una luz.
 */
export function lighten(hex: string, amount: number): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(v + (255 - v) * amount),
  );
  return `#${ch.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
