import { useEffect, useState } from "react";
import { Modal, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { PILL_LABEL_STYLE } from "./pill-button";

// La mitad Android/JS del popover "mantener oprimido para ver el texto completo" — ver
// pill-hold-popover.tsx para el porqué (expo-ios-popover, el módulo nativo que cubre iOS, no tiene
// build de Android en absoluto).
//
// Calcado de `info-tooltip.tsx`: Modal transparente (no una View absoluta hermana) para escapar el
// `overflow:hidden` del cardClip del chat, mismo resorte reanimated para opacity+scale, mismo
// criterio de "mostrar sin esperar la medición" (`visible` manda; la posición se corrige sola en
// cuanto `onLayout` llega). Tres diferencias con aquél: aparece ARRIBA del ancla en vez de abajo,
// lleva una flecha SVG calculada contra el tamaño REAL del bubble (no un offset fijo — acá el
// texto varía mucho más que el mensaje corto del tooltip), y usa la paleta OSCURA de la propia
// píldora `surface`: el popover es la MISMA píldora, más grande, no una superficie distinta.
const MAX_BUBBLE_WIDTH = 260;
const GAP = 10; // separación entre el ancla y la punta de la flecha
const ARROW_SIZE = 8;
const EDGE_MARGIN = 12; // nunca pegado al borde de la pantalla

type Anchor = { x: number; y: number; width: number; height: number };

type AndroidHoldPopoverProps = {
  visible: boolean;
  anchor: Anchor;
  label: string;
};

export function AndroidHoldPopover({ visible, anchor, label }: AndroidHoldPopoverProps) {
  // Ambas dimensiones hacen falta: el ancho para centrar/clamar contra los bordes, el alto para
  // saber CUÁNTO subir el bubble por encima del ancla (que se lea "arriba", no "flotando encima").
  const [bubbleSize, setBubbleSize] = useState({ width: 0, height: 0 });

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = visible
      ? withSpring(1, { damping: 16, stiffness: 260, mass: 0.6 })
      : withTiming(0, { duration: 120 });
  }, [visible, progress]);

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.85 + progress.value * 0.15 }],
  }));

  const anchorCenterX = anchor.x + anchor.width / 2;
  // Centrado en el ancla, clamado a los bordes — mismo criterio que `info-tooltip.tsx`
  // (`Math.max(12, anchor.x - 100)`), con el ancho REAL medido en vez de un offset fijo.
  const bubbleLeft = Math.max(EDGE_MARGIN, anchorCenterX - bubbleSize.width / 2);
  // Antes de medir (`bubbleSize.height === 0`) se ancla por el TOPE del ancla, no por encima —
  // evita un salto grande hacia arriba en el primer frame; en cuanto `onLayout` llega, sube a su
  // posición final de un salto chico, ya cubierto por el resorte.
  const bubbleTop = anchor.y - GAP - ARROW_SIZE - bubbleSize.height;

  // La flecha apunta al centro del ANCLA, no al centro del bubble — si el bubble se clampeó cerca
  // de un borde de la pantalla, la flecha se corre para seguir señalando la píldora real.
  const arrowLeft = Math.min(
    Math.max(anchorCenterX - bubbleLeft - ARROW_SIZE, ARROW_SIZE),
    Math.max(bubbleSize.width - ARROW_SIZE * 3, ARROW_SIZE),
  );

  return (
    <Modal transparent visible={visible} animationType="none">
      <View pointerEvents="none" style={{ flex: 1 }}>
        <Animated.View
          onLayout={(e) => setBubbleSize(e.nativeEvent.layout)}
          style={[
            {
              position: "absolute",
              left: bubbleLeft,
              top: bubbleTop,
              maxWidth: MAX_BUBBLE_WIDTH,
              backgroundColor: "#0A0A0C",
              borderRadius: 14,
              borderCurve: "continuous",
              paddingHorizontal: 14,
              paddingVertical: 10,
            },
            bubbleStyle,
          ]}
        >
          {/* Mismo estilo que la píldora —centrado incluido—: el popover es la MISMA frase, sin
              recortar. Cambiarle la tipografía la haría leer como otra cosa. */}
          <Text style={{ ...PILL_LABEL_STYLE, color: "#FFFFFF" }}>{label}</Text>
        </Animated.View>

        {bubbleSize.height > 0 ? (
          <Animated.View
            style={[
              { position: "absolute", left: bubbleLeft + arrowLeft, top: bubbleTop + bubbleSize.height - 1 },
              bubbleStyle,
            ]}
          >
            <Svg width={ARROW_SIZE * 2} height={ARROW_SIZE}>
              <Path d={`M0,0 L${ARROW_SIZE * 2},0 L${ARROW_SIZE},${ARROW_SIZE} Z`} fill="#0A0A0C" />
            </Svg>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}
