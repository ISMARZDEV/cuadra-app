import * as Haptics from "expo-haptics";
import { useId, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type View as RNView,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
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
//
// DOS VARIANTES, no un juego de props de color sueltas: una píldora es una pieza del sistema, y
// abrir `bg`/`text`/`edge` al llamador habría convertido cada uso en un tema propio.
//   · `brand`   — la original: lima de marca. El contador de mensajes gratis del input.
//   · `surface` — negro en DEGRADADO con letra blanca y canto gris fino. El carrusel de
//                 sugerencias del dock: son ocho píldoras seguidas sobre el chat, y en lima
//                 gritarían por encima de la conversación.

const DEFAULT_HEIGHT = 36;
// El radio NUNCA debe superar la mitad de la altura: RN lo recorta y los extremos salen elípticos
// (le pasó a este mismo botón con el 24.586 que venía de Figma sobre una caja de 36pt).
const DEFAULT_RADIUS = 18;
const DEFAULT_PADDING_X = 10;
const STROKE = 1;

// Resorte de pulsación. Son las constantes del press de TARJETA de `basket-product-card`, no las
// del botón chico: el 0.86 de un icono redondo se ve exagerado en una píldora ancha.
const PRESS_SCALE = 0.96;
const PRESS_IN = { damping: 18, stiffness: 400, mass: 0.7 };
const PRESS_OUT = { damping: 12, stiffness: 260, mass: 0.8 };

// Mismo valor que el único otro long-press del repo (tx-row-item.tsx). No es un número elegido acá
// — es el que ya está calibrado y probado en producción para "sostener, no tocar".
const HOLD_DELAY_MS = 280;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Tipografía de la etiqueta. EXPORTADA porque la detección de truncado
 * (`use-is-truncated.tsx`) tiene que medir el MISMO texto con el MISMO estilo — con una copia
 * suelta, cualquier cambio acá haría mentir la medida en silencio.
 *
 * El `lineHeight` es EXPLÍCITO a propósito, y no es cosmético: sin él RN usa un alto de línea
 * derivado de las métricas de la fuente, distinto por plataforma, y entonces "¿el texto pasa de 2
 * líneas?" deja de tener una respuesta calculable. Con un valor fijo, 2 líneas son exactamente 36pt.
 */
export const PILL_LABEL_STYLE = {
  fontFamily: KANTUMRUY_MEDIUM,
  fontSize: 14,
  lineHeight: 18,
  // Centrado. Importa desde que la etiqueta puede ocupar DOS líneas: una segunda línea corta
  // pegada a la izquierda deja un hueco a la derecha que se lee como un error de layout, no como
  // una frase. En una píldora de una sola línea no cambia nada — la caja del texto mide lo mismo
  // que el texto, así que no hay espacio sobrante que repartir (el contador del input sigue igual).
  textAlign: "center",
} as const;

export type PillVariant = "brand" | "surface";

/** `#RRGGBB` → `rgba(r,g,b,a)`. RN no admite alfa en la notación hex de 6 dígitos. */
function withAlpha(hex: string, alpha: number) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// `fill` es null en `brand` a propósito: su fondo oscuro es TRANSLÚCIDO (`rgba(21,21,21,0.20)`) y
// tiene que seguir dejando pasar el glass del input. Pintarle un Rect opaco encima lo mataría.
//
// `base` es el color plano del contenedor: el degradado en SVG sólo puede dibujarse tras el primer
// `onLayout` (necesita medidas reales), así que sin un color de base habría un frame transparente.
// Por eso `base` ARRASTRA la misma opacidad que el relleno: si quedara opaco taparía por debajo
// exactamente lo que el degradado deja pasar por arriba, y la prop no serviría de nada.
//
// El degradado va de OSCURO ARRIBA a CLARO ABAJO: la píldora se lee como una superficie curvada que
// recoge el rebote de la luz en su borde inferior, no como una tarjeta iluminada de frente.
function palette(variant: PillVariant, isDark: boolean, fillOpacity: number) {
  if (variant === "surface") {
    const fill = (isDark ? ["#0A0A0C", "#1F1F22"] : ["#F1F1F3", "#FFFFFF"]) as [string, string];
    return {
      base: withAlpha(fill[0], fillOpacity),
      fill,
      fillOpacity,
      text: isDark ? "#FFFFFF" : "#034842",
      // OJO: la rampa del canto se INVIERTE con el tema, no es el mismo par aclarado.
      // En oscuro el canto es LUZ: brilla en los extremos (donde la curva encara la fuente) y se
      // apaga en el centro plano. En claro el canto es SOMBRA, así que el orden se da vuelta —
      // más profundo en los extremos, casi nada en el centro. Heredar la rampa oscura tal cual
      // dejaba una banda gris oscura cruzando la mitad de la píldora, que se leía como suciedad.
      edge: (isDark ? ["#7A7A7F", "#3A3A3E"] : ["#D6D6DC", "#EAEAEF"]) as [string, string],
    };
  }
  return {
    base: isDark ? "rgba(21,21,21,0.20)" : "#C2FB7E",
    fill: null,
    fillOpacity: 1,
    text: isDark ? "#C2FB7E" : "#034842",
    edge: (isDark ? ["#525252", "#1C1C1C"] : ["#96DF3F", "#C2FB7E"]) as [string, string],
  };
}

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
  /** El default (10) está calibrado para un contador de 5 caracteres. Una píldora con una frase
   *  dentro —las sugerencias del dock— necesita más aire. */
  paddingHorizontal?: number;
  variant?: PillVariant;
  /** Cuánto deja pasar el FONDO (0 = transparente, 1 = sólido). Sólo afecta al relleno: el texto y
   *  el canto quedan a plena opacidad a propósito — bajarlos también volvería la píldora ilegible
   *  en vez de translúcida. `brand` lo ignora: su fondo ya es translúcido por definición. */
  fillOpacity?: number;
  /** Tope de ancho de la PÍLDORA. Por debajo de él la píldora abraza su contenido; alcanzado el
   *  tope, el texto envuelve en vez de seguir estirándola. */
  maxWidth?: number;
  /** Tope de LÍNEAS: pasadas éstas, el texto se corta con `…`. Independiente de `maxWidth` —
   *  aquél decide dónde envuelve, éste cuántas veces puede hacerlo. Sin esto no hay corte. */
  maxLines?: number;
  /** Camino Android/JS del popover "mantener oprimido para ver el texto completo"
   *  (pill-hold-popover.tsx) — en iOS ese gesto lo maneja el módulo nativo por su cuenta, así que
   *  quien arma la píldora en iOS NUNCA pasa esto. Reporta el rectángulo medido de la píldora
   *  (page-relative) para que el popover sepa dónde anclarse. */
  onHoldReveal?: (anchor: { x: number; y: number; width: number; height: number }) => void;
  /** Se dispara al soltar el dedo, haya habido o no un `onHoldReveal` — es lo que cierra el
   *  popover Android. No confundir con `onPressOut`, que sigue existiendo para el resorte visual. */
  onHoldRelease?: () => void;
};

export function PillButton({
  icon,
  label,
  onPress,
  accessibilityLabel,
  height = DEFAULT_HEIGHT,
  radius = DEFAULT_RADIUS,
  paddingHorizontal = DEFAULT_PADDING_X,
  variant = "brand",
  fillOpacity = 1,
  maxWidth,
  maxLines,
  onHoldReveal,
  onHoldRelease,
}: PillButtonProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  // Id único por instancia: dos <Svg> con el mismo id en <Defs> colisionan (mismo motivo que el
  // degradado de profundidad de `glass-button.tsx`).
  const gid = `pillEdge-${useId()}`;
  const fillId = `${gid}-fill`;
  // El trazo necesita medidas reales, así que se dibuja tras el primer layout.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    setSize((prev) => (prev?.w === width && prev?.h === h ? prev : { w: width, h }));
  };

  // Ref del propio Pressable, sólo para `.measure()` en `onHoldReveal` (Android). Atraviesa
  // `Animated.createAnimatedComponent` sin problema: reanimated reenvía el ref al host nativo real
  // (`css/component/AnimatedComponent.tsx`), no a un envoltorio propio — no hace falta una View
  // extra sólo para poder medir.
  const pillRef = useRef<RNView>(null);
  const handleHoldReveal = onHoldReveal
    ? () => {
        pillRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
          onHoldReveal({ x: pageX, y: pageY, width, height });
        });
      }
    : undefined;

  const { base, fill, fillOpacity: resolvedFillOpacity, text: textColor, edge } = palette(
    variant,
    isDark,
    fillOpacity,
  );

  // Toda la reacción al toque está GATEADA a que haya handler: una píldora decorativa (el contador
  // de mensajes gratis del input, que hoy no tiene acción) no debe hundirse ni vibrar — sería
  // prometer una respuesta que no llega.
  const interactive = Boolean(onPress);
  const scale = useSharedValue(1);
  // El `scale` no altera el canto en SVG: el trazo se dibuja tras el primer `onLayout` con medidas
  // reales, y en RN un `transform` es POST-layout — no vuelve a disparar `onLayout`, así que el
  // stroke no se re-mide ni parpadea al hundirse.
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      ref={pillRef}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPressIn={interactive ? () => (scale.value = withSpring(PRESS_SCALE, PRESS_IN)) : undefined}
      onPressOut={
        interactive || onHoldRelease
          ? () => {
              if (interactive) scale.value = withSpring(1, PRESS_OUT);
              onHoldRelease?.();
            }
          : undefined
      }
      onLongPress={handleHoldReveal}
      delayLongPress={HOLD_DELAY_MS}
      onPress={
        onPress
          ? () => {
              // La háptica va ANTES del handler: el dedo tiene que sentir la respuesta en el mismo
              // frame, no después de que el estado (o una navegación) se resuelva.
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onPress();
            }
          : undefined
      }
      onLayout={onLayout}
      style={[
        {
          height,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal,
          borderRadius: radius,
          backgroundColor: base,
          // El tope va en la PÍLDORA, no en el texto. Puesto en el texto, una etiqueta que envuelve
          // reserva el ancho del tope completo y deja aire muerto a los lados cuando la segunda
          // línea es corta: la píldora dejaba de abrazar su contenido. Acá el contenedor se mide
          // por su contenido y sólo lo limita cuando de verdad lo alcanza.
          ...(maxWidth ? { maxWidth } : null),
        },
        pressStyle,
      ]}
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
            {/* Relleno VERTICAL, de oscuro arriba a claro abajo. */}
            {fill ? (
              <LinearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={fill[0]} />
                <Stop offset="1" stopColor={fill[1]} />
              </LinearGradient>
            ) : null}
          </Defs>
          {/* El relleno va ANTES del trazo para que el canto se dibuje encima y no se coma. */}
          {fill ? (
            <Rect
              x={0}
              y={0}
              width={size.w}
              height={size.h}
              rx={radius}
              ry={radius}
              fill={`url(#${fillId})`}
              fillOpacity={resolvedFillOpacity}
            />
          ) : null}
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
      <Text
        numberOfLines={maxLines}
        ellipsizeMode={maxLines ? "tail" : undefined}
        // `flexShrink` es lo que deja que el texto CEDA cuando la píldora toca su tope y entonces
        // envuelva. Sin esto un texto largo empujaría el contenedor más allá del máximo en vez de
        // partirse en dos líneas.
        style={{ ...PILL_LABEL_STYLE, color: textColor, flexShrink: 1 }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
