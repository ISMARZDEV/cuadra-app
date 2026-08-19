import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useColorScheme } from "nativewind";

import { GlassSurface } from "./glass-surface";

// LA SUPERFICIE DE UN CAMPO DE VIDRIO — la misma que el compositor del chat, en un solo sitio.
//
// ⚠️ POR QUÉ ES UN COMPONENTE Y NO TRES COPIAS DE LA RECETA. Los buscadores de Save tenían que
// quedar «igual que el input del chat», y esa receta son SEIS decisiones que sólo funcionan juntas
// (material, tinte, sombra, borde, toque, geometría). Copiada tres veces, la primera vez que
// alguien ajuste una se separan y dejan de ser el mismo objeto. Acá se toca una y obedecen todas.
//
// La recopila `cuadra-chat-input`; lo que sigue es el porqué de cada una, resumido donde se aplica.

/**
 * Radio del chat input. Se ofrece como defecto para lo que sea RECTANGULAR y crezca; los buscadores
 * de Save son PÍLDORAS de 52pt y pasan `radius: 26` para cerrar la cápsula.
 *
 * (Ojo: RN recorta cualquier radio mayor que la mitad del lado a una cápsula, así que 26 sobre 52 es
 * el tope, no un valor arbitrario.)
 */
export const GLASS_FIELD_RADIUS = 23;

interface GlassFieldProps {
  children: ReactNode;
  /** Radio de la esquina. Por defecto el del chat; una píldora pasa la mitad de su alto. */
  radius?: number;
  /** Estilo del CONTENEDOR — el que lleva la sombra. Acá van ancho, flex y márgenes. */
  style?: StyleProp<ViewStyle>;
  /** Estilo de la fila interior, que es QUIEN DECIDE LA ALTURA. Ver abajo por qué no el cristal. */
  contentStyle?: StyleProp<ViewStyle>;
}

export function GlassField({ children, radius = GLASS_FIELD_RADIUS, style, contentStyle }: GlassFieldProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  // EL TINTE TIENE QUE SER TRANSLÚCIDO — los dos últimos dígitos del hex son el alfa.
  //
  // El vidrio es un efecto de FONDO: taparlo con un color propio deja una superficie plana con
  // forma de vidrio. En oscuro va un gris OSCURO al ~22%, que le da cuerpo sin matar la refracción;
  // un tinte blanco lo lava y lo deja lechoso. En claro va BLANCO con alfa y NO el `#f2f2f7` del
  // repo de referencia: ése es el systemGray6 de iOS, lleva componente azul y sobre blanco se lee
  // lavanda.
  const tint = isDark ? "#1c1c1e38" : "#ffffff8c";

  return (
    <View
      style={[
        {
          // ⚠️ LA SOMBRA VA AQUÍ, FUERA DEL CRISTAL. En iOS una sombra y un `overflow: hidden` en la
          // misma vista se recortan entre sí. Y es la sombra —no el radio ni el color— lo que
          // despega la placa del fondo: sin ella se lee como un rectángulo pintado por muy correcto
          // que sea el material.
          shadowColor: "#000",
          shadowOpacity: 0.14,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 10 },
          elevation: 2,
        },
        style,
      ]}
    >
      <GlassSurface
        // `regular`, NO `clear`: la transparente no tiene nada que dejar pasar cuando detrás hay un
        // fondo plano, y se ve como nada. La esmerilada tiene luminosidad propia.
        glassEffectStyle="regular"
        // El material se deforma bajo el dedo. Es la animación del toque del chat, y es NATIVA:
        // escalar el cristal —o cualquier ancestro suyo— lo rasteriza y lo satura.
        isInteractive
        tint={tint}
        tintOpacity={0.22}
        // NI `overflow: hidden` NI altura acá. `isInteractive` deforma la GEOMETRÍA de la placa, y
        // las dos cosas se lo impiden: el material sólo podría apretar su contenido mientras el
        // contorno se queda congelado. La altura la pone la fila de dentro.
        //
        // `borderCurve: "continuous"` es el squircle de Apple, nativo de RN. Y NO se dibuja ningún
        // borde: el `GlassView` pinta su propio canto, y un trazo encima queda FUERA del material —
        // no se deforma con él y se queda quieto mientras la placa rebota.
        style={{ borderRadius: radius, borderCurve: "continuous" }}
      >
        {/* El cristal ENVUELVE el contenido para poder RECIBIR el toque: como fondo `absoluteFill`
            nunca le llegaría un solo evento, y `isInteractive` no se dispararía jamás. */}
        <View style={contentStyle}>{children}</View>
      </GlassSurface>
    </View>
  );
}
