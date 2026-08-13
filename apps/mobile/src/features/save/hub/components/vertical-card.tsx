import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useColorScheme } from "nativewind";
import * as Haptics from "expo-haptics";

import { KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import BackdropSwirl from "../../../../assets/save/backdrop-swirl.svg";
import OffertSeal from "../../../../assets/save/offert-botton-dark.svg";
import StarFilled from "../../../../assets/save/star-icon-check.svg";
import StarOutline from "../../../../assets/save/star-icon-no-check.svg";
import type { VerticalCardProps } from "../../interfaces";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Card de vertical del hub (Figma 879:17917).
//
// LA CAJA, tal como la entrega Figma: contenido 364×153, borde de 2 y radio 25 — o sea 368×157 de
// caja total. En RN el `borderWidth` va POR DENTRO del alto, así que el alto declarado es el de la
// caja completa (157) y el borde se come 2 por lado hasta dejar los 153 del diseño.
//
// Ese borde blanco sobre fondo blanco NO es decorativo aunque no se vea como línea: es lo que deja
// un aro de 2pt entre el panel de arte y el canto del card. Sin él la ilustración sangra hasta el
// borde y el card pierde el marco que se ve en la referencia.
const CARD_CONTENT_HEIGHT = 153;
const CARD_BORDER = 2;
const CARD_HEIGHT = CARD_CONTENT_HEIGHT + CARD_BORDER * 2;
const CARD_RADIUS = 25;

// El fondo del card. En claro es blanco como el diseño; en oscuro NO se queda blanco: sería una
// mancha de luz sobre negro. El borde arrastra el MISMO color a propósito — no se lee como línea,
// es el aro de color del card que se dibuja ENCIMA del arte y le deja su marco.
const CARD_BG_LIGHT = "#FFFFFF";
const CARD_BG_DARK = "#151515";

// El panel es el propio `backdrop-swirl.svg`: 187×153, y trae el verde `#034842` de fondo CON su
// borde izquierdo curvo (la panza de ~8pt) más la guirnalda encima. Por eso el ancho es FIJO y no
// un porcentaje: con el alto clavado en 153, 187 es el único ancho que respeta su proporción. Lo
// que cambia entre un SE y un Pro es el blanco de la izquierda, que es justo lo que debe ceder.
const PANEL_WIDTH = 187;
const EMBLEM_SIZE = 133; // 133/153 — la proporción del emblema dentro del panel, de Figma

// Los dos sellos comparten sangría: la estrella arriba a la izquierda y el de ofertas arriba a la
// derecha, a la misma altura. Un solo par de constantes, para que no se desalineen por deriva.
//
// La sangría horizontal es CHICA a propósito, y va contra la intuición: cuanto MENOR es, más se
// pegan los sellos al canto del card — y más se despegan del emblema, que es el problema real. El
// panel mide 187 y el emblema 133: quedan 27 por lado, así que un sello a 20 del borde se le monta
// encima. A 12 respira.
const BADGE_SIZE = 28;
const BADGE_INSET_X = 12;
const BADGE_INSET_Y = 12;

// El verde de marca sobre el card blanco; en oscuro el título pasa a BLANCO. El lima que funciona
// sobre blanco pierde contraste sobre el `#151515` y compite con el verde del panel de al lado:
// sobre fondo oscuro el que manda es el blanco, y el color queda para el arte.
const TITLE_COLOR_LIGHT = "#6ac400";
const TITLE_COLOR_DARK = "#FFFFFF";
const TITLE_SIZE = 30;
const TITLE_LINE_HEIGHT = 34;
// El diseño indenta el título bastante más (~50pt), pero eso sólo cierra con Asap Condensed, que la
// app no carga: con Kantumruy, «Insurance» a 30pt no entra en el blanco que queda y el card
// terminaría encogiendo la tipografía de UNA vertical sí y de las otras no.
//
// Es su PROPIA constante, no `BADGE_INSET_X`: los sellos se pegan al canto para despegarse del
// emblema, y el título no tiene por qué seguirlos hasta ahí — atados, apretar uno corría el otro.
const TITLE_LEFT = 12;
// El aire bajo la última línea. Sale más grande de lo que dice el número: el `lineHeight` de 34
// sobre una letra de 30 ya deja ~4pt de interlínea por debajo de la base, y eso se suma acá.
const TITLE_BOTTOM = 12;

// Mismos resortes que `glass-button` y la tarjeta del chat: el tacto de la app es UNO.
const PRESS_IN = { damping: 15, stiffness: 320, mass: 0.6 };
const PRESS_OUT = { damping: 11, stiffness: 220, mass: 0.7 };

export function VerticalCard({ vertical, onPress }: VerticalCardProps) {
  const { colorScheme } = useColorScheme();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const isDark = colorScheme === "dark";
  const cardBg = isDark ? CARD_BG_DARK : CARD_BG_LIGHT;
  const titleColor = isDark ? TITLE_COLOR_DARK : TITLE_COLOR_LIGHT;
  const Star = vertical.featured ? StarFilled : StarOutline;

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
          backgroundColor: cardBg,
          // La sombra del diseño, tal cual: baja y muy difusa, apenas despega el card del fondo.
          // Vive ACÁ y no en la capa que recorta: en iOS `overflow: "hidden"` y `shadow*` en la
          // MISMA vista se pelean — `clipsToBounds` recorta también la sombra y la borra.
          shadowColor: "#000",
          shadowOpacity: 0.19,
          shadowRadius: 12.4,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        },
        animStyle,
      ]}
    >
      {/* La capa que RECORTA. El canto de Apple (curvatura continua) sólo sale con un radio
          UNIFORME: en cuanto una vista pide radios distintos por esquina, iOS abandona
          `cornerCurve` y recorta con una máscara de ARCOS DE CÍRCULO. Por eso recorta este
          contenedor —radio parejo— y no el panel, que necesitaría sólo sus dos esquinas derechas y
          devolvía el canto duro. Verificado con lupa sobre el render real.
          El borde se pinta ENCIMA de los hijos ya recortados: de ahí sale el aro de 2pt del
          diseño, parejo en todo el contorno y siguiendo la misma curva. */}
      <View
        style={{
          flex: 1,
          borderRadius: CARD_RADIUS,
          borderCurve: "continuous",
          overflow: "hidden",
          borderWidth: CARD_BORDER,
          borderColor: cardBg,
          backgroundColor: cardBg,
        }}
      >
      {/* Panel de arte — pegado al borde derecho, por dentro del aro del card */}
      <View
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: PANEL_WIDTH,
          // Sin radio ni `overflow` propios: lo recorta la capa de arriba.
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* El SVG pinta su propio fondo verde y su borde izquierdo curvo: no hay `backgroundColor`
            debajo a propósito — uno plano taparía la curva y devolvería el corte recto. */}
        <BackdropSwirl
          width={PANEL_WIDTH}
          height={CARD_CONTENT_HEIGHT}
          style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}
        />
        <Image
          source={vertical.art}
          style={{ width: EMBLEM_SIZE, height: EMBLEM_SIZE }}
          resizeMode="contain"
        />
      </View>

      {/* Título — se parte donde lo parte el diseño, no donde cae el wrap automático.
          SIN `adjustsFontSizeToFit`: probado en simulador, con un `lineHeight` explícito iOS lo
          encoge a ojo y de forma DESIGUAL — «Super/market» y «Loans &/Insurance» salían a ~11pt
          mientras «Credit Cards» quedaba a 30. Cuatro cards de la misma fila con dos tamaños de
          letra es peor que un título que roza el borde en una pantalla angosta. */}
      <View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          right: PANEL_WIDTH,
          // Al PIE de la columna izquierda, no centrado: la estrella ocupa la esquina de arriba y
          // el título ancla abajo, así el blanco del medio queda de una pieza en vez de partido en
          // dos huecos. Un título de una línea y otro de dos comparten la misma línea de base.
          justifyContent: "flex-end",
          paddingLeft: TITLE_LEFT,
          paddingRight: 8,
          paddingBottom: TITLE_BOTTOM,
        }}
      >
        <Text
          numberOfLines={vertical.titleLines.length}
          style={{
            fontFamily: KANTUMRUY_SEMIBOLD,
            color: titleColor,
            fontSize: TITLE_SIZE,
            lineHeight: TITLE_LINE_HEIGHT,
          }}
        >
          {vertical.titleLines.join("\n")}
        </Text>
      </View>

      {/* Estrella: RELLENA en la vertical destacada, contorno en el resto. Los dos SVG traen su
          propio círculo lima, así que acá no hay contenedor que pintar. */}
      <Star
        width={BADGE_SIZE}
        height={BADGE_SIZE}
        style={{
          position: "absolute",
          left: BADGE_INSET_X,
          top: BADGE_INSET_Y,
          pointerEvents: "none",
        }}
      />

      {/* El sello de ofertas, arriba a la DERECHA — sobre el panel de arte, en diagonal con la
          estrella.
          Va SIEMPRE la variante `-dark`, en LOS DOS TEMAS, y el nombre engaña: «dark» describe la
          SUPERFICIE sobre la que se apoya, no el tema de la app. Su glifo es blanco, y el panel es
          `#034842` en claro y en oscuro por igual. La variante `-light` trae el glifo en ese mismo
          `#034842`: sobre el panel el «%» desaparece — se lee como un hueco troquelado, no como un
          símbolo. Verificado con lupa sobre el render. */}
      <OffertSeal
        width={BADGE_SIZE}
        height={BADGE_SIZE}
        style={{
          position: "absolute",
          right: BADGE_INSET_X,
          top: BADGE_INSET_Y,
          pointerEvents: "none",
        }}
      />
      </View>
    </AnimatedPressable>
  );
}
