import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Star } from "lucide-react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { Icon } from "@/components/ui/icon";
import { KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import BackdropSwirl from "../../../../assets/save/verticals/backdrop-swirl.svg";
import type { VerticalCardProps } from "../../interfaces";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Card de vertical del hub (Figma 879:17917). Medidas del diseño: 364×153, radio 25, sombra
// `0 4px 12.4px -4px rgba(0,0,0,.19)`. El ancho lo da el contenedor —la pantalla es de 402 en el
// diseño pero un SE es de 375—, así que acá solo se fija el ALTO y la proporción se sostiene sola.
const CARD_HEIGHT = 153;
const CARD_RADIUS = 25;
// El panel ocupa poco más de la mitad derecha y sangra hasta el borde: es lo que hace que el card
// se lea como «marca + ventana», no como una foto recortada.
const PANEL_RATIO = 0.52;
const PANEL_COLOR = "#034842"; // muestreado del render, y ya es el verde de las tarjetas del chat
const TITLE_COLOR = "#6ac400";
const BADGE_COLOR = "#C2FB7E";

// Mismos resortes que `glass-button` y la tarjeta del chat: el tacto de la app es UNO.
const PRESS_IN = { damping: 15, stiffness: 320, mass: 0.6 };
const PRESS_OUT = { damping: 11, stiffness: 220, mass: 0.7 };

export function VerticalCard({ vertical, onPress }: VerticalCardProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={vertical.title}
      onPressIn={() => {
        scale.value = withSpring(0.97, PRESS_IN);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, PRESS_OUT);
      }}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress(vertical);
      }}
      style={[
        {
          height: CARD_HEIGHT,
          borderRadius: CARD_RADIUS,
          borderCurve: "continuous",
          backgroundColor: "#FFFFFF",
          overflow: "hidden",
          // La sombra del diseño, tal cual: baja y muy difusa, apenas despega el card del fondo.
          shadowColor: "#000",
          shadowOpacity: 0.19,
          shadowRadius: 12.4,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        },
        animStyle,
      ]}
    >
      {/* Panel de arte — sangra el borde derecho */}
      <View
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: `${PANEL_RATIO * 100}%`,
          backgroundColor: PANEL_COLOR,
          borderTopLeftRadius: CARD_RADIUS,
          borderBottomLeftRadius: CARD_RADIUS,
          borderCurve: "continuous",
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* El trazo del fondo, compartido por las cuatro verticales */}
        <BackdropSwirl
          width="150%"
          height="150%"
          preserveAspectRatio="xMidYMid slice"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {vertical.art ? (
          <Image
            source={vertical.art}
            style={{ width: "88%", height: "88%" }}
            resizeMode="contain"
          />
        ) : null}
      </View>

      {/* Título — dos líneas, como el diseño. Va en Kantumruy: el diseño pide Asap Condensed y la
          app no la carga; agregar una familia es una decisión de peso, no un detalle de esta card. */}
      <View className="h-full justify-center pl-5" style={{ width: `${(1 - PANEL_RATIO) * 100}%` }}>
        <Text
          style={{
            fontFamily: KANTUMRUY_SEMIBOLD,
            color: TITLE_COLOR,
            fontSize: 30,
            lineHeight: 34,
          }}
          numberOfLines={2}
        >
          {vertical.title}
        </Text>
      </View>

      {/* Estrella: RELLENA en la vertical destacada, contorno en el resto */}
      <View
        className="absolute left-2 top-3 h-7 w-7 items-center justify-center rounded-full"
        style={{ backgroundColor: BADGE_COLOR }}
      >
        <Icon
          as={Star}
          size={16}
          color={PANEL_COLOR}
          fill={vertical.featured ? PANEL_COLOR : "transparent"}
          strokeWidth={2}
        />
      </View>
    </AnimatedPressable>
  );
}
