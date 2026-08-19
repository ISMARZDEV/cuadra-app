import { useId } from "react";
import { StyleSheet, View } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { BlurView } from "expo-blur";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

// Banda superior del scroll — va DELANTE de la lista, así el contenido que sube se DESVANECE en vez
// de cortarse a ras del borde.
//
// No es sólo un degradado: es un **desenfoque con degradado**. Lo que asciende se difumina y se
// apaga, y eso es lo que produce la sensación de que ARRIBA HAY MÁS — un corte limpio comunica
// «acá se acaba», un difuminado comunica «esto sigue». Es lo que hace ChatGPT.
//
// Receta: `MaskedView` cuyo mask es un degradado vertical (opaco arriba → transparente abajo), y
// dentro un `BlurView` más un lavado del color del fondo. El mask hace que TANTO el desenfoque COMO
// el lavado se desvanezcan juntos; si sólo se pusiera el blur, su borde inferior se vería como una
// línea recta.
//
// El degradado del mask se dibuja con `react-native-svg`, NO con `expo-linear-gradient`: su vista
// nativa no se enlaza de forma fiable en el dev build (mismo motivo documentado en glass-button).
// `pointerEvents="none"`: es puramente visual, jamás bloquea toques.
//
// Nació dentro de `chat-screen.tsx` y se extrajo acá al necesitarlo el hub de Ahorra. NO se copió:
// dos desvanecidos que deberían verse igual y viven en archivos distintos terminan divergiendo al
// primer retoque.
type TopScrollFadeProps = {
  height: number;
  isDark: boolean;
  /** El color del lavado. Por defecto el del fondo de la tarjeta del chat; una pantalla con otro
   *  fondo tiene que pasar el suyo o la banda se ve como una nube de otro color. */
  color?: string;
};

export function TopScrollFade({ height, isDark, color }: TopScrollFadeProps) {
  // Id único por instancia. El chat y el hub viven en pestañas distintas del MISMO navegador, así
  // que pueden estar montados a la vez — y dos `<Defs>` con el mismo id colisionan (la lección ya
  // pagada en `glass-button` y `pill-button`).
  const gid = `topScrollFade-${useId()}`;
  const wash = color ?? (isDark ? "#000000" : "#ffffff");

  return (
    <MaskedView
      style={{ position: "absolute", top: 0, left: 0, right: 0, height }}
      pointerEvents="none"
      maskElement={
        <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              {/* Totalmente opaco en el borde superior y ya transparente al 70%: el último tramo
                  se deja limpio para que el contenido entre en foco ANTES de terminar la banda. */}
              <Stop offset="0" stopColor="#000000" stopOpacity="1" />
              <Stop offset="0.7" stopColor="#000000" stopOpacity="0.35" />
              <Stop offset="1" stopColor="#000000" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gid})`} />
        </Svg>
      }
    >
      <BlurView intensity={26} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
      {/* El lavado: el blur sólo difumina, no APAGA. Sin esto el contenido se vería borroso pero
          igual de brillante, y no leería como que se está yendo. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: wash, opacity: 0.65 }]} />
    </MaskedView>
  );
}
