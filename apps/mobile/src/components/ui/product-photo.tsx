import { View, type DimensionValue, type ViewStyle } from "react-native";
import { ImageOff } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";

/**
 * La foto de un producto del catálogo, con su placa y su carga.
 *
 * ⭐ Compartida desde su SEGUNDO consumidor: la tarjeta de la rejilla y el detalle de producto. Y
 * no es reuso por ahorrar líneas — es que **las dos no pueden discrepar sobre un hecho del
 * catálogo**. La tarjeta ya tenía verificado (contra el CDN de VTEX) que las fotos son JPEG SIN
 * canal alfa y con fondo blanco puro; el detalle se escribió afirmando lo contrario en un
 * comentario («el catálogo llega con fondos recortados») y en oscuro sacaba un ladrillo blanco a
 * sangre. El hecho es uno; la pieza que lo encarna también.
 */

/** Cuánto tarda la foto en fundirse sobre su hueco una vez el CDN la entrega. */
const FADE_MS = 240;

/**
 * El estilo de la PLACA, que es donde vive toda la decisión.
 *
 * ⭐ **Blanca en los DOS temas, y a propósito.** La foto trae su propio fondo blanco pegado, así
 * que cualquier otro color le dibujaría un recuadro alrededor. El blanco es inevitable.
 *
 * ⭐ **Lo que sí cambia es el CANTO.** En claro la placa se funde con la cáscara clara y un radio
 * no aporta nada; en oscuro el blanco destaca sí o sí, y redondearlo es lo que hace que se lea como
 * una placa deliberada en vez de como un agujero en el tema.
 */
export const PHOTO_PLATE = "#FFFFFF";

/**
 * El radio de la placa, en unidades de DISEÑO — quien dibuja a varios tamaños lo escala con su
 * propia `s()`. La tarjeta se pinta en la rejilla y en los carruseles, y un radio fijo se vería el
 * doble de redondo en una que en la otra.
 */
export function photoPlateRadius(scheme: "light" | "dark"): number {
  return scheme === "dark" ? 10 : 0;
}

/**
 * El tono del hueco que espera debajo mientras la foto viaja desde el CDN. El MISMO tono del
 * barrido del esqueleto de Save, para que la espera se lea igual en toda la vertical.
 */
export function photoPendingColor(scheme: "light" | "dark"): string {
  return scheme === "dark" ? "#242424" : "#EFEFF2";
}

export function photoPlateStyle(scheme: "light" | "dark"): ViewStyle {
  return {
    backgroundColor: PHOTO_PLATE,
    borderRadius: photoPlateRadius(scheme),
    borderCurve: "continuous",
    overflow: "hidden",
  };
}

interface Props {
  uri?: string | null;
  /** Tamaño de la PLACA. Lo decide quien la monta: la rejilla la quiere cuadrada, el detalle alta. */
  width?: DimensionValue;
  height?: DimensionValue;
  /** Tamaño del icono de «sin imagen». */
  fallbackSize?: number;
}

export function ProductPhoto({
  uri,
  width = "100%",
  height = "100%",
  fallbackSize = 36,
}: Props) {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";

  // ⭐ La foto SE FUNDE sobre su hueco, no aparece de golpe. Viene del CDN del proveedor, así que
  // tarda bastante más que el resto de la pantalla: sin esto, la placa entra en blanco y la foto
  // cae encima segundos después, fuera de la coreografía de entrada. Medido en el detalle: el
  // contenido a 2833 ms y la foto a 3050 ms más la decodificación.
  const photoIn = useSharedValue(0);
  const photoStyle = useAnimatedStyle(() => ({ opacity: photoIn.value }));
  // ⭐ El hueco se RETIRA a la vez que entra la foto, derivado del MISMO reloj.
  //
  // Quedándose debajo para siempre se le veían los cantos: con `contain` la foto no llena la placa
  // —una lata es más alta que ancha—, y por arriba y por abajo asomaban dos franjas grises donde
  // debía haber blanco. El hueco es para la ESPERA; pasada la espera, estorba.
  const pendingStyle = useAnimatedStyle(() => ({ opacity: 1 - photoIn.value }));

  if (!uri) {
    return (
      <View
        className="items-center justify-center"
        style={[photoPlateStyle(scheme), { width, height }]}
      >
        {/* Sin foto va un icono que lo DICE. Un hueco vacío se lee como una imagen que no cargó
            —un error— cuando lo cierto es que ese producto no tiene foto en el catálogo.

            La etiqueta va en el envoltorio y no en el `Icon`: el `Icon` compartido sólo reenvía
            `as`/`size`/`color`/`strokeWidth`/`fill`, así que cualquier prop de accesibilidad que se
            le pase se pierde EN SILENCIO. */}
        <View
          aria-label={t("save.product.noImage")}
          accessibilityLabel={t("save.product.noImage")}
          accessibilityRole="image"
        >
          <Icon as={ImageOff} size={fallbackSize} color="#D1D5DB" />
        </View>
      </View>
    );
  }

  return (
    <View style={[photoPlateStyle(scheme), { width, height }]}>
      <Animated.View
        testID="product-photo-pending"
        style={[
          {
            position: "absolute",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            backgroundColor: photoPendingColor(scheme),
          },
          pendingStyle,
        ]}
      />
      <Animated.Image
        // La URL llega YA DIMENSIONADA desde el API (`domain/image_variant`): los originales son
        // 1000×1000 y decodifican 4 MB cada uno. El recorte lo hace el servidor porque la forma de
        // la URL es conocimiento del PROVEEDOR — y así la web se beneficia igual que la app.
        source={{ uri }}
        onLoad={() => {
          photoIn.value = withTiming(1, { duration: FADE_MS });
        }}
        style={[{ width: "100%", height: "100%" }, photoStyle]}
        resizeMode="contain"
        accessibilityRole="image"
      />
    </View>
  );
}
