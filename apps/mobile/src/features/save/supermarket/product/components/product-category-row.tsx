import { ArrowRight } from "lucide-react-native";
import { Image, Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useColorScheme } from "nativewind";

import { cardPalette } from "@/components/ui/basket-product-card";
import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";
import { KANTUMRUY_REGULAR } from "@/theme/fonts";

import { categoryImage, fallbackInitial } from "../../category-images";
import type { HeaderSkin } from "../../header-palette";
import { CHIP_EDGE, DEEP_GREEN } from "../product-palette";
import { DepthGradient, lighten } from "./depth-gradient";

/** El disco de la ilustración. Los PNG se guardan a 180 px, o sea 60 pt en la pantalla más densa
 *  que existe: pedir más de 60 aquí sería ampliar un mapa de bits. Ver `category-images`. */
const DISC = 48;
/** El disco de la flecha. Más chico que el de la ilustración a propósito: la categoría es el
 *  sujeto de la fila y el botón es la salida, no al revés. */
const GO = 40;
const GLYPH = 22;
/** Entre el disco, el nombre y la flecha. */
const GAP = 14;
/** El aire de la fila contra sus dos rayas. */
const PAD_Y = 16;

export interface RowCategory {
  slug: string;
  name: string;
}

interface Props {
  category: RowCategory;
  /** La carta de ESTA llegada. De ella salen los dos colores del botón — ver abajo. */
  skin: HeaderSkin;
  /** Lleva al listado de esa categoría. */
  onPress: () => void;
}

/**
 * A QUÉ CATEGORÍA PERTENECE ESTE PRODUCTO, y la puerta para ir a verla entera.
 *
 * ⭐ **La ilustración sale del MISMO mapa que la ruleta de la home** (`categoryImage`, indexado por
 * SLUG —nunca por nombre, que cambia con el idioma—). Un dibujo parecido pintado a mano se habría
 * separado del original al primer retoque.
 *
 * ⭐ **La categoría que se enseña es la RAÍZ del breadcrumb, no la hoja.** Sólo las de primer nivel
 * tienen ilustración exportada, y son las que el usuario reconoce de la rueda: «Despensa &
 * Abarrotes» dice algo, «Cremas y leches vegetales» es una rama que nunca ha visto. Quien elige la
 * raíz es la pantalla — ver `product-screen`.
 *
 * ⭐⭐ **El botón es un DISCO, no una píldora, y sus colores salen de la CARTA de la llegada.** Se
 * construyó primero con `PillButton` —el «ver todos» de los carruseles— y salía elíptico: ancho
 * distinto de alto. La forma del mock es redonda, que es la receta de `ProductActions`, así que
 * comparte con ella el relleno, el brillo del canto (`DepthGradient`) y el muelle al tocar. Y al
 * seguir a la carta, la flecha cambia de color con los tres botones de arriba en vez de ser lo
 * único de la pantalla que no se enteró de que la cabecera repartió otro tono.
 *
 * ⚠️ **Toda la fila lleva al mismo sitio, no sólo la flecha.** La flecha es la señal —es lo que se
 * lee como «hay más por aquí»— pero un objetivo de 40 pt en el canto derecho, con el nombre al lado
 * pareciendo inerte, es una promesa que el dedo falla. El `Pressable` de la fila va
 * `accessible={false}` a propósito: quien anuncia la acción es el botón, y dos nodos accesibles
 * para una sola acción convierten un control en dos.
 */
export function ProductCategoryRow({ category, skin, onPress }: Props) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  // Los dos colores del disco, igual que en la fila de acciones: relleno con la tinta de la carta,
  // glifo con su fondo, para que el botón se lea como un hueco recortado en ella.
  const tint = skin.button?.tint ?? skin.ink;
  const glyph = skin.button?.icon ?? skin.bg;
  // El disco de debajo de la ilustración es la misma superficie que usa la ruleta, y está por la
  // misma razón: el PNG tarda en decodificar y sin nada debajo el sitio se ve VACÍO un instante.
  const surface = cardPalette(isDark ? "dark" : "light").shell;
  const image = categoryImage(category.slug);

  // ⚠️ La raya NO usa `border-border`: ese token es «lima tenue» (`rgb(219 234 217)`) y teñía de
  // verde los dos filetes, que en el diseño son GRISES neutros. `CHIP_EDGE` es ese gris, y ya
  // existía en la paleta de esta pantalla.
  const rule = isDark ? "#1E3A2A" : CHIP_EDGE;

  const press = useSharedValue(1);
  const goAnim = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  return (
    <Pressable
      accessible={false}
      onPress={onPress}
      className="flex-row items-center"
      style={{
        gap: GAP,
        paddingVertical: PAD_Y,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: rule,
      }}
    >
      {image ? (
        <View style={{ width: DISC, height: DISC }}>
          <View
            style={{
              position: "absolute",
              width: DISC,
              height: DISC,
              // Círculo de verdad: SIN squircle. En un círculo no hay lado recto contra el que
              // suavizar la curva — sólo añadiría una vista nativa. Ver `cuadra-design-system`.
              borderRadius: DISC / 2,
              backgroundColor: surface,
            }}
          />
          <Image
            source={image}
            style={{ width: DISC, height: DISC }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
      ) : (
        // Respaldo para las categorías cuya ilustración todavía no exportaron. Es el mismo que la
        // ruleta (`fallbackInitial`): un disco vacío se lee como una imagen que falló; la inicial
        // se lee como una categoría.
        <View
          style={{
            width: DISC,
            height: DISC,
            borderRadius: DISC / 2,
            backgroundColor: surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontFamily: KANTUMRUY_REGULAR, fontSize: 20, color: DEEP_GREEN }}>
            {fallbackInitial(category.name)}
          </Text>
        </View>
      )}

      <Text
        className="flex-1"
        style={{
          // REGULAR y no MEDIUM: en el mock el nombre pesa MENOS que el título del producto, y con
          // el peso de más competía con él por ser el primer texto que se lee del bloque.
          fontFamily: KANTUMRUY_REGULAR,
          fontSize: 19,
          lineHeight: 25,
          // Verde profundo, no la tinta del tema: en claro el `text` es un azul marino frío que en
          // el mock no está, y esta fila es la única de la cabecera que habla del catálogo.
          color: isDark ? "#F7FAF7" : DEEP_GREEN,
        }}
        // Dos líneas y no una: los nombres del catálogo son largos («Embutidos & Delicatessen») y
        // truncar el que el usuario acaba de reconocer en la rueda sería esconder justo el dato.
        numberOfLines={2}
      >
        {category.name}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("save.product.category.go")}
        onPress={onPress}
        onPressIn={() => {
          press.value = withSpring(0.86, { damping: 15, stiffness: 320, mass: 0.6 });
        }}
        onPressOut={() => {
          press.value = withSpring(1, { damping: 11, stiffness: 220, mass: 0.7 });
        }}
      >
        <Animated.View
          style={[
            {
              width: GO,
              height: GO,
              borderRadius: GO / 2,
              backgroundColor: tint,
              alignItems: "center",
              justifyContent: "center",
            },
            goAnim,
          ]}
        >
          <DepthGradient color={lighten(tint, 0.2)} size={GO} />
          <Icon as={ArrowRight} size={GLYPH} color={glyph} strokeWidth={2.5} />
        </Animated.View>
      </Pressable>
    </Pressable>
  );
}
