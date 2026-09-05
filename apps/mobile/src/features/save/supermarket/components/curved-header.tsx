import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { GlassButton } from "@/components/ui/glass-button";
import { KANTUMRUY_MEDIUM } from "@/theme/fonts";

import { LAYER } from "../layers";
import { HEADER_SKIN_GREEN, type HeaderSkin } from "../header-palette";

// El header verde de Supermarket, con el canto inferior CURVO y capaz de COLAPSAR al desplazarse.
//
// La curva es un SVG APARTE del rectángulo verde, y no un solo path que incluya ambos. Ese es el
// cambio que hace posible el colapso: con la forma entera dibujada en un SVG, encoger el header
// obliga a re-generar el path en cada frame; con el verde en una `View` normal y la panza colgando
// por debajo, el alto se anima como cualquier otro estilo y la curva viaja pegada sin recalcularse.
//
// No se usa `borderBottomRadius`: los radios redondean las DOS puntas y dejan el centro recto,
// mientras que el diseño pide una panza continua que baja en el medio. Son formas distintas.
// El verde vive en `header-palette.ts` junto a las cinco cartas: es la misma decisión.
const GREEN = HEADER_SKIN_GREEN.bg;

// Cuánto BAJA la panza en el centro respecto a los costados. Por debajo de ~20 la curva se lee como
// un error de redondeo; por encima de ~36 se come la primera fila en una pantalla corta.
export const HEADER_BULGE = 28;

/** Alto de la fila de botones (volver · título · canasta). */
export const HEADER_ROW = 48;
/** Alto de la fila de pestañas. */
export const HEADER_TABS = 52;

// El aro del header es el MISMO `GlassButton` del hub de Ahorra, no un botón propio. Un botón
// redondo distinto por pantalla es cómo una app termina con tres lenguajes de botón — y el usuario
// que viene del hub reconoce el gesto sin tener que aprenderlo otra vez.
const HEADER_BUTTON = 48;

interface CurvedHeaderProps {
  title: string;
  /** 0 = desplegado · 1 = colapsado. Lo maneja la pantalla desde el scroll. */
  progress: SharedValue<number>;
  /** Área segura: el verde nunca baja de aquí, o el reloj del sistema quedaría sobre la rejilla. */
  safeTop: number;
  onBack?: () => void;
  backLabel: string;
  backIcon: LucideIcon;
  basketLabel: string;
  basketCount: number;
  onBasket?: () => void;
  basketIcon: LucideIcon;
  /**
   * El reloj del CONTENIDO (título y botones), si debe diferir del de la cáscara.
   *
   * Por defecto es el mismo `progress`: la cabecera encoge y su contenido se va con ella. El
   * detalle de producto los separa porque allí quien empuja los controles hacia arriba es la
   * tarjeta de la foto, que se retira mucho antes de que el verde termine de encoger — con un solo
   * reloj, la tarjeta les pasaba por encima en vez de empujarlos.
   */
  contentProgress?: SharedValue<number>;
  /**
   * Cuánto SUBE el contenido mientras se va, en puntos.
   *
   * Por defecto 34: en la rejilla la cabecera entera se retira de un tirón y los controles la
   * acompañan hacia arriba, que es lo que dice que se van CON ella.
   *
   * El detalle de producto pasa **0** a propósito: allí el header se queda FIJO y quien se mueve es
   * la tarjeta de la foto, que les pasa por encima. Si además se desplazaran, dos cosas se moverían
   * en direcciones que el usuario no pidió y el header dejaría de leerse como el suelo firme sobre
   * el que la foto se desliza.
   */
  contentLift?: number;
  /**
   * En qué punto del reloj del contenido termina de apagarse.
   *
   * Por defecto 0.6: la cabecera de la rejilla encoge deprisa y sus controles tienen que estar
   * fuera antes de que el verde los alcance. El detalle pasa **1** porque su reloj YA es la ventana
   * exacta del apagado (ver `HEADER_CONTENT_FADE`) — recortarla otra vez aquí la dejaría a la mitad.
   */
  contentFadeEnd?: number;
  /**
   * Aire verde EXTRA por debajo de la fila de botones, antes de que empiece la curva.
   *
   * Por defecto 0: la mayoría de las cabeceras quieren la curva pegada a la fila, y reservar sitio
   * «por si acaso» fue justo el defecto que dejó al detalle con 52pt de verde vacío. Se pide
   * explícitamente donde el diseño lo pide — en el detalle, para que la tarjeta de la foto tenga
   * verde de sobra sobre el que montarse.
   */
  belowRow?: number;
  /**
   * Hacia dónde arquea el canto inferior.
   *
   * `convex` (por defecto) = el verde BAJA en el centro, como una gota. Es lo que llevan la home y
   * la rejilla, donde debajo empieza contenido y la panza lo acuna.
   *
   * `concave` = al revés: el verde baja en los LADOS y el blanco SUBE en el centro. Es la forma del
   * detalle de producto, y no es un capricho — la hoja blanca de abajo se lee como una SUPERFICIE
   * que asciende hacia la foto, en vez de como un fondo que el header pisa.
   */
  curve?: CurveDirection;
  /**
   * La PIEL de color ya resuelta para el tema: su fondo y su tinta, del mismo tono.
   *
   * Por defecto el verde de Supermarket, que es lo que quieren la home y la rejilla; el detalle de
   * producto pasa una distinta en cada llegada (ver `header-palette.ts`).
   *
   * ⭐ Viaja como PAREJA y no como dos props sueltas: separadas se podría pasar el fondo y olvidar
   * la tinta, y esa combinación existe rota — sobre el lima, el blanco da 1.40:1 de contraste. Un
   * solo objeto hace imposible el estado a medias.
   */
  skin?: HeaderSkin;
  /** Las pestañas de categoría, que viajan DENTRO del verde. */
  children?: ReactNode;
}

export type CurveDirection = "convex" | "concave";

/**
 * El canto inferior, en unidades del viewBox (100 de ancho × `HEADER_BULGE` de alto).
 *
 * ⭐ El punto de control va al DOBLE de la flecha deseada porque una bezier cuadrática sólo llega a
 * la MITAD del camino hacia su control: en `t = 0.5` la curva vale `¼·P0 + ½·C + ¼·P2`. Escribir la
 * flecha directamente en el control daría una curva con la mitad de panza de la pedida.
 */
function curvePath(direction: CurveDirection): string {
  if (direction === "concave") {
    // El verde llega abajo en los LADOS y se retira en el centro: el blanco sube por el medio.
    // Control en `-HEADER_BULGE` para que el vértice caiga exactamente en 0.
    return `M0 0 L0 ${HEADER_BULGE} Q50 ${-HEADER_BULGE} 100 ${HEADER_BULGE} L100 0 Z`;
  }
  return `M0 0 H100 Q50 ${HEADER_BULGE * 2} 0 0 Z`;
}

export function CurvedHeader({
  title,
  progress,
  safeTop,
  onBack,
  backLabel,
  backIcon,
  basketLabel,
  basketCount,
  onBasket,
  basketIcon,
  curve = "convex",
  belowRow = 0,
  contentProgress,
  contentLift = 34,
  contentFadeEnd = 0.6,
  skin = HEADER_SKIN_GREEN,
  children,
}: CurvedHeaderProps) {
  // ⭐ Los colores del botón los trae la PIEL, y puede no traerlos: la cabecera verde deja el lima
  // de marca de siempre. Cuando los trae, el vidrio va de la tinta y el glifo del fondo — el botón
  // se lee como un hueco recortado en la cabecera y no como una pieza pegada encima.
  //
  // Se resuelve en `resolveSkin` y no aquí porque la regla depende del TEMA (en oscuro el tinte es
  // blanco: el material del vidrio se oscurece y se traga los tonos claros — ver `buttonTint`), y
  // esa decisión pertenece a la paleta, no a la maquetación.
  const buttonPalette = skin.button;
  // ⭐ El alto de las PESTAÑAS sólo se reserva si hay pestañas. Sin esto, una pantalla sin ellas
  // —el detalle de producto— arrastraba 52pt de verde vacío bajo la fila de botones: casi el doble
  // de cabecera que el diseño, y el contenido empezaba muy por debajo de donde debía.
  //
  // Es la diferencia entre reservar sitio para lo que HAY y reservarlo para lo que este componente
  // suele llevar.
  const expanded = safeTop + HEADER_ROW + (children ? HEADER_TABS : 0) + belowRow;
  // Colapsado se queda la franja del área segura y un dedo de verde: sin ese resto, la curva
  // aterrizaría sobre el reloj del sistema.
  const collapsed = safeTop + 6;

  const shellStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [expanded, collapsed]),
  }));

  // El contenido se va HACIA ARRIBA mientras se desvanece, en vez de sólo desaparecer: acompaña al
  // dedo. Y deja de recibir toques en cuanto empieza a irse — un botón invisible que aún responde
  // es peor que uno que no está.
  // El contenido puede llevar SU propio reloj — ver `contentProgress`. Se resuelve fuera del
  // worklet para que éste capture una referencia y no una condición.
  const contentClock = contentProgress ?? progress;
  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(contentClock.value, [0, contentFadeEnd], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(contentClock.value, [0, 1], [0, -contentLift]) }],
  }));

  return (
    <Animated.View style={[{ backgroundColor: skin.bg, zIndex: LAYER.header }, shellStyle]}>
      {/* La panza CUELGA por debajo del verde. Al vivir fuera de la caja, encoger el header la
          arrastra sin que su path cambie ni un punto. */}
      <Svg
        width="100%"
        height={HEADER_BULGE}
        viewBox={`0 0 100 ${HEADER_BULGE}`}
        preserveAspectRatio="none"
        pointerEvents="none"
        style={{ position: "absolute", bottom: -HEADER_BULGE, left: 0, right: 0 }}
      >
        <Path d={curvePath(curve)} fill={skin.bg} />
      </Svg>


      <Animated.View style={[{ paddingTop: safeTop }, contentStyle]} pointerEvents="box-none">
        <View className="flex-row items-center justify-between px-4" style={{ height: HEADER_ROW }}>
          <GlassButton
            icon={backIcon}
            label={backLabel}
            onPress={onBack}
            size={HEADER_BUTTON}
            palette={buttonPalette}
          />
          {/* El título va CENTRADO en absoluto y los botones anclados a los costados: con un
              `justify-between` se descentraría en cuanto un lado cambie de ancho — y acá uno de los
              dos crece cuando el contador pasa de 9 a 10. */}
          <View
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            className="items-center justify-center"
          >
            <Text
              numberOfLines={1}
              style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 20, color: skin.ink }}
            >
              {title}
            </Text>
          </View>
          <GlassButton
            icon={basketIcon}
            label={basketLabel}
            onPress={onBasket}
            size={HEADER_BUTTON}
            badge={basketCount}
            palette={buttonPalette}
          />
        </View>

        {children}
      </Animated.View>
    </Animated.View>
  );
}
